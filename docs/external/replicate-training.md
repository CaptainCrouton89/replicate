# Replicate Model Training & Deployment - LLM Reference

## Critical Architecture

Replicate uses **Cog** (open-source containerization tool) to package ML models into production-ready containers with automatic HTTP APIs and web GUIs. Models run on Replicate's infrastructure or your own.

### Non-Obvious Pattern: Training Destinations

When fine-tuning, you must specify a **destination model** that acts as a version collection. Multiple training runs targeting the same destination model automatically create new versions—don't create new models per training run.

```python
# WRONG: Creating new model for each training
train_result = replicate.trainings.create(
    destination="user/my-model-v1",  # Don't do this for each run
    ...
)

# CORRECT: Reuse destination model, versions auto-increment
train_result = replicate.trainings.create(
    destination="user/my-model",  # Same model, different training = new version
    ...
)
```

---

## Cog Configuration (cog.yaml)

### Basic Structure

```yaml
build:
  python_version: "3.11"
  python_packages:
    - "torch==2.0.1"
    - "numpy==1.24.0"
  system_packages:
    - "ffmpeg"
    - "libsm6"
  gpu: true

predict: "predict.py:Predictor"
train: "train.py:train"  # Optional, for fine-tuning capable models
```

### Key Constraints

- **`python_version`**: Must be string, e.g., "3.11" (not 3.11 or "3.x")
- **`gpu: true`**: Automatically configures CUDA/cuDNN based on PyTorch/TensorFlow versions
- **`predict`**: Format is `"filename:ClassName"` (not file path, must be module-level class)
- **`train`**: Format is `"filename:function_name"` or `"filename:ClassName"` for class-based training

### Non-Obvious Behaviors

- System packages specified in cog.yaml run in Docker before Python packages
- GPU true automatically detects and configures CUDA version matching installed frameworks (never specify CUDA manually)
- Each cog.yaml change requires re-pushing the model; pushing rebuilds the Docker image

---

## Predictor Class (predict.py)

### Base Structure

```python
from cog import BasePreditor, Input, Path
from typing import Any

class Predictor(BasePredictor):
    def setup(self):
        """Runs once at container startup. Load models/weights here."""
        # This runs ONCE per container initialization
        # Not once per prediction
        self.model = load_heavy_model()

    def predict(self,
                image: Path = Input(description="Input image"),
                scale: float = Input(description="Scale factor", default=2.0, ge=0.1, le=4.0)
    ) -> Path:
        """Runs once per prediction request."""
        result = self.model.process(image, scale)
        return Path(result)
```

### Input Parameter Constraints

```python
# Numeric constraints
learning_rate: float = Input(default=1e-4, ge=1e-6, le=1e-1)  # ge=greater-equal, le=less-equal

# String constraints
name: str = Input(min_length=1, max_length=100)
email: str = Input(regex=r"^[\w\.-]+@[\w\.-]+\.\w+$")

# Choice constraints (enumeration)
model_size: str = Input(choices=["small", "medium", "large"])

# File inputs - use Path (not str)
image: Path = Input(description="Image to process")

# Multiple outputs - return dict or custom class
from cog import BaseModel

class Output(BaseModel):
    image: Path
    metadata: dict
    confidence: float

def predict(self, ...) -> Output:
    return Output(
        image=Path(result_path),
        metadata={"key": "value"},
        confidence=0.95
    )
```

### Non-Obvious Constraints

- **setup() timing**: Called once per container instance, not per prediction. For expensive model loading, place in setup(). For state that changes per prediction, place in predict().
- **File inputs**: Use `Path` type, not `str`. Cog downloads remote files automatically to local filesystem.
- **File outputs**: Return `Path` objects; Cog uploads them to cloud storage and returns URLs in response.
- **Return types**: Must be serializable (dict, list, str, int, float, bool, Path, File, or custom BaseModel)

---

## Training Configuration (train.py)

### Function-Based Training (Simple)

```python
from cog import Input, Path, File
from pathlib import Path as PathlibPath
from pydantic import BaseModel

def train(
    train_data: Path = Input(description="Training dataset tar/zip"),
    learning_rate: float = Input(default=1e-4, ge=0),
    batch_size: int = Input(default=32, ge=1, le=256),
    epochs: int = Input(default=10, ge=1),
    seed: int = Input(default=42)
) -> Path:
    """
    Returns path to trained weights/model checkpoint.
    Replicate automatically creates new version from return value.
    """
    # Extract train_data (Cog passes as local filesystem path)
    import tarfile
    with tarfile.open(train_data) as tar:
        tar.extractall("data/")

    # Train model...
    weights_path = "outputs/weights.pt"

    # Return path - Replicate uploads and creates version
    return Path(weights_path)
```

### Class-Based Training (Multi-Run Efficiency)

```python
class Trainer(BasePredictor):
    def setup(self):
        """Load base model once. Runs once per container startup."""
        self.base_model = load_foundation_model()

    def train(self,
              train_data: Path = Input(description="Training data"),
              learning_rate: float = Input(default=1e-4)) -> Path:
        """Runs once per training invocation. Reuses setup() model."""
        # Fine-tune base model with training data
        trained = self.base_model.fine_tune(train_data, learning_rate)
        output_path = "outputs/weights.tar"
        trained.save(output_path)
        return Path(output_path)
```

### Training Output Formats

```yaml
# Simple: Return single file
train: "train.py:train" -> Path

# Complex: Return custom BaseModel with multiple fields
class TrainingOutput(BaseModel):
    weights: Path  # Trained model weights
    metrics: dict  # {"loss": 0.05, "accuracy": 0.95}
    checkpoints: list  # List of Path objects for intermediate checkpoints

def train(...) -> TrainingOutput:
    return TrainingOutput(
        weights=Path("final_weights.pt"),
        metrics={"final_loss": 0.045},
        checkpoints=[Path(f"ckpt_{i}.pt") for i in range(5)]
    )
```

### Non-Obvious Training Behaviors

- **Return value becomes new version**: Whatever file/path you return is automatically packaged as a new version
- **setup() vs train() separation**: For multiple fine-tunes on same base model, use class pattern—setup() runs once (fast), train() runs per training (your actual training code)
- **Testing trained weights locally**: Use environment variable to pass pre-trained weights:
  ```bash
  cog predict -e COG_WEIGHTS=https://url/weights.tar -i prompt="test"
  ```
- **Training status tracking**: Via `GET /v1/trainings/{training_id}`, returns `status` (starting, processing, succeeded, failed, canceled), `logs`, `output`, `predict_time`

---

## Hardware Selection

### Available GPU SKUs (2025)

```
# Standard options
gpu-t4          # 16GB VRAM - development, small models
gpu-a40-small   # 24GB VRAM - medium models, inference
gpu-a40-large   # 48GB VRAM - larger models, training
gpu-a100        # 40GB VRAM - HPC-grade training
gpu-a100-20gb   # 20GB VRAM - A100 variant

# Latest (2025) - premium tier
gpu-h100        # 80GB VRAM - flagship, multi-GPU support
gpu-h100-2x     # 160GB total - 2x H100, distributed training
gpu-h100-4x     # 320GB total - 4x H100
gpu-h100-8x     # 640GB total - 8x H100

# Budget
cpu             # No GPU, inference only
```

### Hardware Selection Constraints

- **Training destination model requires same/compatible hardware**: If base model runs on A100, fine-tuning should use A100 or H100 (not T4)
- **Changing hardware doesn't change code**: Push once with Cog, use deployments or API to select hardware per-run
- **VRAM estimation for training**: ~16GB per billion parameters (FP16). Example: 7B model = 112GB minimum (requires H100 2x or distributed training)
- **Cost vs Speed tradeoff**: H100 costs ~8x more than T4 but trains ~15x faster (relative to model size)

### Selection Pattern

```python
# Via Python API - create model with specific hardware
model = replicate.models.create(
    owner="my-username",
    name="my-model",
    visibility="private",
    hardware="gpu-a100"  # Hardware specified at model creation
)

# Change hardware without code changes - use Deployment instead
# Deployments provide fixed endpoint with configurable hardware
deployment = replicate.deployments.create(
    model="owner/model-name",
    hardware="gpu-h100",  # Upgrade without touching code
    min_instances=1,  # Always keep 1 instance warm
)
```

---

## Model Creation & Visibility

### Creating Models Programmatically

```python
import replicate

# Python API method
model = replicate.models.create(
    owner="my-username",  # Your username or organization slug
    name="my-fine-tuned-model",  # Model name (lowercase, hyphens OK)
    visibility="private",  # or "public"
    hardware="gpu-a100",  # See Hardware section
    description="Fine-tuned LLaMA for domain X"
)
# Returns: Model object with .owner, .name, .url
```

```bash
# HTTP API method
curl -X POST \
  -H "Authorization: Token $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "my-username",
    "name": "my-model",
    "visibility": "private",
    "hardware": "gpu-a100",
    "description": "Fine-tuned model"
  }' \
  https://api.replicate.com/v1/models
```

### Visibility Rules

```
PRIVATE MODEL:
- Only visible to creator + organization members
- Cannot be discovered on Replicate homepage
- API access requires authentication + ownership check
- Best practice: Start here, test, then make public

PUBLIC MODEL:
- Visible to all users
- Discoverable via search
- Anyone can run (and see code if source_url set)
- Cannot easily change back to private without breaking users

⚠️ GOTCHA: Making public model private breaks all external access immediately
```

### Changing Visibility

```python
# Via API - update visibility
replicate.models.update(
    model="owner/model-name",
    visibility="public"  # or "private"
)

# Via web: Settings tab of your model page
```

### Organization-Based Sharing

```python
# Private model in organization (shared team access)
model = replicate.models.create(
    owner="my-organization",  # Organization slug, not username
    name="team-model",
    visibility="private"  # Only org members can see
)
```

---

## Training API

### Creating Training Runs

```python
import replicate

# Start fine-tuning
training = replicate.trainings.create(
    model="stabilityai/stable-diffusion-3",  # Base model to fine-tune
    destination="my-username/my-finetuned-model",  # Destination model (auto-creates if doesn't exist)
    input={
        "train_data": "s3://my-bucket/data.tar.gz",
        "learning_rate": 1e-4,
        "epochs": 3,
        "batch_size": 32
    },
    # Optional
    webhook="https://example.com/webhook",
    webhook_events_filter=["start", "output", "logs", "completed"]
)

# Returns Training object: .id, .status, .logs, .output, .metrics
```

```bash
# HTTP API equivalent
curl -X POST \
  -H "Authorization: Token $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "stabilityai/stable-diffusion-3",
    "destination": "alice/my-model",
    "input": {
      "train_data": "s3://bucket/data.tar.gz",
      "learning_rate": 0.0001
    },
    "webhook": "https://example.com/webhook"
  }' \
  https://api.replicate.com/v1/trainings
```

### Training Status Tracking

```python
training = replicate.trainings.get(training_id)

# Check status
print(training.status)  # "starting", "processing", "succeeded", "failed", "canceled"
print(training.logs)    # Streaming logs from training container
print(training.output)  # Final output (Path to weights)
print(training.metrics) # {"predict_time": 1234.5}

# Wait for completion (blocking)
training.wait()

# Cancel if needed
training.cancel()
```

### Non-Obvious Training Constraints

- **Destination model must exist**: Create model first if it doesn't exist
- **New versions auto-increment**: Each completed training creates a new version (no manual versioning needed)
- **Input must match training.py signature**: Input dict keys must match function/method parameters in train.py
- **Webhook events**: start (training initialized), output (training completed), logs (streaming logs), completed (all events sent)
- **Training may take hours**: Use `webhook` to avoid polling. Without webhook, check status periodically via `trainings.get()`

---

## Deployment & Serving

### Deployments (Fixed Endpoint with Hardware Control)

```python
# Create private, fixed endpoint with configurable hardware
deployment = replicate.deployments.create(
    model="owner/model-name",
    name="prod-deployment",
    hardware="gpu-h100-4x",  # Upgrade hardware without code
    min_instances=1,  # Always warm
    max_instances=10  # Auto-scale up to 10
)

# Returns endpoint URL for private API access
# Example: https://deployments.replicate.com/v1/predictions

# Run prediction against deployment (same predict() API, different endpoint)
prediction = replicate.predictions.create(
    version=deployment.version,
    input={"prompt": "generate..."},
    webhook="https://example.com/webhook"
)
```

### Non-Obvious Deployment Behaviors

- **Min instances = 1**: Container always running = no cold start (costs more)
- **Min instances = 0**: Container spins down when idle = cheaper but cold starts (5-30sec)
- **Max instances**: Auto-scales up under load; scales to zero when requests stop
- **Hardware changes via deployment, not code**: Create new deployment with different hardware for A/B testing without redeploying model code

---

## Model Versioning

### Version Auto-Creation

```
When you:
- Retrain with new data → new version
- Update predict.py code → new version (must re-push via cog push)
- Update dependencies in cog.yaml → new version (must re-push)

Versions appear as new entries in model's "Versions" tab
```

### Specifying Versions in API

```python
# Run latest version (default)
replicate.run("owner/model-name", input={...})

# Run specific version
replicate.run("owner/model-name:abc123def456", input={...})

# List all versions
model = replicate.models.get("owner/model-name")
for version in model.versions:
    print(version.id, version.created_at)
```

### Non-Obvious Versioning

- **Versions are immutable**: Once created, a version never changes (ensures reproducibility)
- **Latest version is default**: Without explicit version hash, API uses most recent version
- **Version ID is commit SHA**: Based on model code + dependencies at push time
- **Deleting versions**: Only possible on private models; public models keep all versions (cannot break public API)

---

## Pushing Models to Replicate

### Workflow

```bash
# 1. Create cog.yaml + predict.py (see above)
# 2. Test locally
cog predict -i "prompt=test"

# 3. Create model on Replicate (web or API)
# At https://replicate.com/create or via API

# 4. Authenticate with Replicate API token
export REPLICATE_API_TOKEN="your-api-token-here"
cog auth token  # Alternative: interactive login

# 5. Push to Replicate
cog push r8.im/username/model-name
# Builds Docker image, uploads, creates version
```

### Non-Obvious Push Behaviors

- **`cog push` rebuilds entire Docker image**: Changes to cog.yaml or predict.py trigger image rebuild (takes 2-10 minutes)
- **Registry format**: Must use `r8.im/username/model-name` (not Docker registry format)
- **First push takes longest**: Subsequent pushes only rebuild changed layers
- **API token required**: Set `REPLICATE_API_TOKEN` env var before pushing

---

## API Rate Limits

```
POST /predictions (create prediction):     600 req/min
All other endpoints:                       3000 req/min

Responses with 429 status: Retry after delay specified in response
```

### Handling Rate Limits

```python
import time
import replicate

try:
    prediction = replicate.predictions.create(...)
except replicate.APIError as e:
    if e.status_code == 429:
        retry_after = int(e.response.headers.get("retry-after", 60))
        time.sleep(retry_after)
        prediction = replicate.predictions.create(...)
    else:
        raise
```

---

## Common Gotchas

### Gotcha 1: Confusing Training Destination with Source Model
```python
# WRONG: destination is where training results go, not source
training = replicate.trainings.create(
    destination="owner/base-model",  # This is output model
    input={...}  # Where's the base model to fine-tune?
)

# CORRECT: model param specifies what to fine-tune
training = replicate.trainings.create(
    model="stabilityai/stable-diffusion-3",  # Source to fine-tune
    destination="owner/my-finetuned",  # Where results go
    input={...}
)
```

### Gotcha 2: Forgetting setup() Runs Once Per Container
```python
# WRONG: Loading model in predict() wastes time
def predict(self, prompt: str) -> str:
    model = load_model()  # Loads every prediction!
    return model(prompt)

# CORRECT: Load once in setup()
def setup(self):
    self.model = load_model()  # Loads once at startup

def predict(self, prompt: str) -> str:
    return self.model(prompt)  # Use cached model
```

### Gotcha 3: Returning File Paths Instead of Path Objects
```python
# WRONG: Returns string path
def predict(self, ...) -> str:
    return "/tmp/output.png"  # Cog doesn't upload this!

# CORRECT: Return Path object
from cog import Path

def predict(self, ...) -> Path:
    return Path("/tmp/output.png")  # Cog uploads to cloud, returns URL
```

### Gotcha 4: Making Public Models Private Breaks Users
```python
# DON'T DO THIS if your model has users
replicate.models.update(
    model="owner/popular-model",
    visibility="private"  # Breaks all external access immediately
)

# INSTEAD: Create new private model for proprietary version
private_model = replicate.models.create(
    owner="owner",
    name="proprietary-model",
    visibility="private"
)
```

### Gotcha 5: Training Destination Model Must Exist
```python
# WRONG: destination model doesn't exist
training = replicate.trainings.create(
    destination="owner/nonexistent-model",  # Will fail!
    input={...}
)

# CORRECT: Create destination first
replicate.models.create(
    owner="owner",
    name="finetuned-model",
    visibility="private",
    hardware="gpu-a100"
)

training = replicate.trainings.create(
    destination="owner/finetuned-model",
    input={...}
)
```

---

## Version: 2025-10-29

**Key Resources:**
- Replicate Docs: https://replicate.com/docs
- Cog GitHub: https://github.com/replicate/cog
- Python Client: https://github.com/replicate/replicate-python
- HTTP API Reference: https://replicate.com/docs/reference/http

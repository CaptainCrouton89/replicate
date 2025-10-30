# Replicate CLI

A command-line interface for interacting with the Replicate API. This CLI tool allows you to list models, create predictions, and manage your prediction history directly from the terminal.

## Installation

### Local Development Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the project:**
   ```bash
   npm run build
   ```

3. **Link globally (for development):**
   ```bash
   npm link
   ```

   This makes the `replicate` command available globally on your system.

### Production Installation

To install from a published npm package (if published):
```bash
npm install -g replicate-cli
```

## Configuration

The CLI loads your Replicate API token from a `.env.local` file in the project root.

Create or update `.env.local`:
```
REPLICATE_API_TOKEN=your_api_token_here
```

You can get your API token from [replicate.com/account](https://replicate.com/account).

## Usage

### Models

#### List Models
```bash
replicate models:list
```

Search for models:
```bash
replicate models:list --search "text-to-image"
```

Output as JSON:
```bash
replicate models:list --json
```

#### Show Model Details
View model information and input schema:
```bash
replicate models:show owner/model-name
```

Example:
```bash
replicate models:show stability-ai/stable-diffusion
```

### Predictions

#### Create a Prediction

Create a prediction with inline arguments:
```bash
replicate predictions:create owner/model-name --key1=value1 --key2=value2
```

Example:
```bash
replicate predictions:create stability-ai/stable-diffusion --prompt="A beautiful sunset" --num_outputs=2
```

**Using a JSON input file:**
```bash
replicate predictions:create owner/model-name --input-file=input.json
```

**Combining file and inline arguments** (inline arguments override file values):
```bash
replicate predictions:create owner/model-name --input-file=input.json --override_key=value
```

**Argument Types:**
- Strings: `--prompt="Hello world"`
- Numbers: `--width=512`
- Booleans: `--enable_flag=true` or `--enable_flag=false`
- JSON arrays/objects: Use a JSON input file

**Find required arguments:**
Use `models:show` to see what arguments a model accepts:
```bash
replicate models:show owner/model-name
```

#### Get Prediction Status
```bash
replicate predictions:get <prediction-id>
```

Watch until completion:
```bash
replicate predictions:get <prediction-id> --watch
```

Output as JSON:
```bash
replicate predictions:get <prediction-id> --json
```

#### List Predictions
View your prediction history:
```bash
replicate predictions:list
```

Limit results:
```bash
replicate predictions:list --limit 10
```

## Examples

### Complete Workflow

1. **Find a model:**
   ```bash
   replicate models:list --search "image generation"
   ```

2. **Check model requirements:**
   ```bash
   replicate models:show stability-ai/stable-diffusion
   ```

3. **Create a prediction:**
   ```bash
   replicate predictions:create stability-ai/stable-diffusion \
     --prompt="A futuristic city at sunset" \
     --width=1024 \
     --height=1024 \
     --num_outputs=1
   ```

4. **Check status:**
   ```bash
   replicate predictions:get <prediction-id> --watch
   ```

5. **View history:**
   ```bash
   replicate predictions:list
   ```

## Development

### Project Structure
```
.
├── src/
│   ├── commands/          # CLI commands
│   │   ├── models/        # Model-related commands
│   │   └── predictions/   # Prediction-related commands
│   └── utils/             # Shared utilities
├── bin/                   # Executable entry point
├── lib/                   # Compiled JavaScript (generated)
└── package.json
```

### Building
```bash
npm run build
```

### Testing Locally
After linking with `npm link`, test commands:
```bash
replicate --help
replicate models:list
```

## Troubleshooting

**Error: REPLICATE_API_TOKEN not found**
- Ensure `.env.local` exists in the project root
- Verify the token is correctly formatted: `REPLICATE_API_TOKEN=your_token_here`

**Command not found after npm link**
- Make sure your shell has the npm bin directory in PATH
- Try: `export PATH="$(npm config get prefix)/bin:$PATH"`

**Invalid argument errors**
- Use `models:show` to check the model's input schema
- Ensure required fields are provided
- Check argument types match the schema (string, number, boolean)

## License

MIT


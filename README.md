# @r-cli/replicate

A powerful CLI tool for interacting with the Replicate API. List models, create predictions, and manage your AI workflows directly from the terminal.

## Installation

```bash
npm install -g @r-cli/replicate
```

### Local Development

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

## Authentication

The CLI will automatically prompt you for your API token on first use. Get your token from [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens).

### Interactive Authentication (Recommended)

Simply run any command, and you'll be prompted to enter your API token:

```bash
replicate models:list
# 🔑 No API token found.
# Get your API token from: https://replicate.com/account/api-tokens
#
# Enter your API token: ********
# ✓ Token saved successfully!
```

Your token is securely stored at `~/.config/replicate/config` and automatically used for all future commands.

### Manual Authentication

You can also authenticate explicitly using:

```bash
replicate auth:login
```

### Alternative Authentication Methods

The CLI checks for your API token in this order:

1. **Config file** (recommended): `~/.config/replicate/config`
2. **Environment variable**: `REPLICATE_API_TOKEN`
3. **dotenv file**: `.env.local` or `.env` in current directory

To use environment variables:
```bash
export REPLICATE_API_TOKEN=your_api_token_here
replicate models:list
```

Or create a `.env.local` file:
```bash
# .env.local
REPLICATE_API_TOKEN=your_api_token_here
```

### Managing Authentication

**View current authentication status:**
```bash
replicate auth:whoami
```

**Manually set or update your token:**
```bash
replicate auth:login
# or
replicate config:set token r8_your_token_here
```

**View your configuration:**
```bash
replicate config:get
# or view specific value
replicate config:get token
```

**Logout (remove stored token):**
```bash
replicate auth:logout
```

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

**Authentication Issues**
- Run `replicate auth:whoami` to verify your authentication status
- If you see "Invalid or expired API token", run `replicate auth:login` to re-authenticate
- Your token is stored at `~/.config/replicate/config`

**Command not found after npm link**
- Make sure your shell has the npm bin directory in PATH
- Try: `export PATH="$(npm config get prefix)/bin:$PATH"`

**Invalid argument errors**
- Use `models:show` to check the model's input schema
- Ensure required fields are provided
- Check argument types match the schema (string, number, boolean)

## License

MIT


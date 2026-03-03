# Trivia Transcription Assistant 🎮📝

**Automatically transcribe and organize trivia questions from live Twitch streams in real-time**

Never miss a question again! This tool captures audio from live Twitch trivia streams, transcribes questions using AI, extracts the important details, and automatically logs everything to a structured Excel spreadsheet—giving you more time to focus on answering rather than frantically writing down questions.

---

## ✨ Features

- 🔴 **Live Stream Processing** - Connects directly to Twitch streams (no audio routing needed)
- 🎙️ **Real-Time Transcription** - Uses Faster-Whisper for low-latency speech-to-text
- 🤖 **Intelligent Question Extraction** - GPT-4 powered extraction identifies questions, question numbers, hours, and picture questions
- 🔄 **Duplicate Detection** - Automatically skips repeated questions (both readings)
- 📊 **Organized Excel Output** - Each hour gets its own sheet with formatted, searchable questions
- ⚡ **Low Latency** - Questions appear in Excel ~20-25 seconds after being asked
- 🎯 **Smart Filtering** - Ignores music, introductions, and other non-question audio
- 🏷️ **Picture Question Marking** - Automatically identifies and flags picture questions

---

## 📋 Table of Contents

- [How It Works](#-how-it-works)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [Excel Output Format](#-excel-output-format)
- [Performance & Latency](#-performance--latency)
- [Troubleshooting](#-troubleshooting)
- [Advanced Configuration](#-advanced-configuration)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🔧 How It Works

┌─────────────────────────────────────────────────────────────┐
│ LIVE TWITCH STREAM                                           │
│ (Audio: Questions + Songs + Introductions)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ STREAMLINK                                                   │
│ • Gets live stream URL                                       │
│ • Selects audio-only or lowest quality stream                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ FFMPEG                                                       │
│ • Extracts audio in real-time                                │
│ • Converts to 16kHz mono PCM                                 │
│ • Pipes to Python                                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ AUDIO QUEUE (Continuous Buffer)                             │
│ • Stores 1-second chunks                                     │
│ • Maximum 100 chunks (~1.6 minutes buffer)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ SLIDING WINDOW PROCESSOR                                     │
│ • Every 15 seconds, grab 30 seconds of audio                 │
│ • 50% overlap ensures complete question capture              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ FASTER-WHISPER (Transcription)                              │
│ • Transcribes 30s audio → text (~2-3 seconds)                │
│ • VAD filters out silence/music sections                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ DUPLICATE CHECK (Transcription Level)                       │
│ • 80% word similarity = repeated reading                     │
│ • Skip if duplicate                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ GPT-4 EXTRACTION                                             │
│ • Extracts question number, hour, actual question            │
│ • Identifies picture questions                               │
│ • Returns null if no question found                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ DUPLICATE CHECK (Question Level)                            │
│ • 85% similarity = already saved                             │
│ • Skip if duplicate                                          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ EXCEL WRITER                                                 │
│ • Adds to appropriate hour sheet                             │
│ • Records timestamp                                          │
│ • Marks picture questions                                    │
└─────────────────────────────────────────────────────────────┘



**Timeline Example:**
- `00:00` - Question asked on stream
- `00:20` - Question repeated (second reading)
- `00:25` - Question appears in your Excel spreadsheet ✅
- `00:30` - Song plays
- `01:30` - Next question begins

---

## 📦 Prerequisites

### Required Software

- **Python 3.8 or higher** - [Download Python](https://www.python.org/downloads/)
- **FFmpeg** - For audio processing
  - Windows: `choco install ffmpeg` or [manual download](https://ffmpeg.org/download.html)
  - Mac: `brew install ffmpeg`
  - Linux: `sudo apt install ffmpeg`

### Required API Keys

- **OpenAI API Key** - For question extraction with GPT-4
  - Sign up at [OpenAI](https://platform.openai.com/)
  - Estimated cost: ~$0.05-0.10 per hour of trivia
  - You can use GPT-3.5-turbo for cheaper option (~$0.01/hour)

### System Requirements

- **RAM**: 2GB minimum (4GB recommended)
- **CPU**: Multi-core recommended for faster transcription
- **Storage**: 1GB for models and dependencies
- **Internet**: Stable connection required for live streaming

---

## 🚀 Installation

### Step 1: Clone or Download

```bash
# Clone the repository
git clone <repository-url>
cd trivia-transcription-assistant

# Or download and extract the ZIP file
```

### Step 2: Create Virtual Environment

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Mac/Linux:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies

```bash
pip install -r requirements.txt
```

This will install:

- `streamlink` - Twitch stream access
- `faster-whisper` - Fast speech recognition
- `openai` - GPT-4 API access
- `openpyxl` - Excel file handling
- And other required packages

### Step 4: Verify FFmpeg Installation

```bash
ffmpeg -version
```

You should see version information. If not, FFmpeg needs to be installed or added to your PATH.

### Step 5: Download Whisper Model (First Run)

The first time you run the application, it will automatically download the Whisper model (~140MB for "base" model). This is a one-time download and will be cached locally.

---

## ⚙️ Configuration

### 1. Create .env File

Create a file named `.env` in the project root directory:

```bash
# Required Settings
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx
TWITCH_CHANNEL_URL=https://www.twitch.tv/your_trivia_channel

# Optional Settings (defaults shown)
WHISPER_MODEL_SIZE=base
WHISPER_DEVICE=cpu
WINDOW_DURATION=30
OVERLAP_DURATION=15
LOG_LEVEL=INFO
```

🎯 Usage
Basic Usage


Start the application:
Bashpython main.py



Wait for connection:
Unknown🔴 Connecting to Twitch stream: https://www.twitch.tv/your_channel
✓ Using audio-only stream
✓ Live stream connected!
⏳ Waiting for stream to stabilize...
✅ LIVE PROCESSING ACTIVE


The app runs automatically!

Questions are detected and saved to data/trivia_questions.xlsx
Watch the console for real-time status updates


Open Excel file:

Open data/trivia_questions.xlsx in Excel/Google Sheets
Questions appear within 20-25 seconds of being asked
Each hour has its own sheet tab





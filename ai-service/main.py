import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, UploadFile, File
import whisper
import shutil
from services.gemini_service import extract_tasks_with_gemini
from dotenv import load_dotenv

load_dotenv()
app = FastAPI()

model = whisper.load_model("base")

diarization_pipeline = None
try:
    hf_token = os.environ.get("HF_TOKEN")
    if hf_token:
        from pyannote.audio import Pipeline
        diarization_pipeline = Pipeline.from_pretrained(
            "pyannote/speaker-diarization-3.1",
            use_auth_token=hf_token
        )
except Exception as e:
    print(f"Failed to load Pyannote diarization pipeline: {e}")

@app.post("/process")
async def process_audio(file: UploadFile = File(...)):
    file_location = f"temp_{file.filename}"
    
    try:
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        result = model.transcribe(file_location)
        text = result["text"]
        segments = result.get("segments", [])

        if diarization_pipeline is not None:
            try:
                diarization = diarization_pipeline(file_location)
                enriched_lines = []
                for segment in segments:
                    start = segment["start"]
                    end = segment["end"]
                    speakers_in_segment = {}
                    for turn, _, speaker in diarization.itertracks(yield_label=True):
                        overlap = max(0, min(end, turn.end) - max(start, turn.start))
                        if overlap > 0:
                            speakers_in_segment[speaker] = speakers_in_segment.get(speaker, 0) + overlap
                    
                    dominant_speaker = "Speaker"
                    if speakers_in_segment:
                        dominant_speaker = max(speakers_in_segment, key=speakers_in_segment.get)
                    
                    enriched_lines.append(f"{dominant_speaker}: {segment['text'].strip()}")
                
                text = " ".join(enriched_lines)
            except Exception as e:
                print(f"Diarization failed: {e}")

        ai_output = extract_tasks_with_gemini(text)

        return {
            "text": text,
            "summary": ai_output.get("summary", "No summary available"),
            "tasks": ai_output.get("tasks", [])
        }
    
    except Exception as e:
        print(f"Error processing audio: {e}")
        raise
    
    finally:
        # Clean up temp file
        if os.path.exists(file_location):
            try:
                os.remove(file_location)
            except Exception as e:
                print(f"Failed to delete temp file: {e}")
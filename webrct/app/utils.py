import subprocess
from pathlib import Path
from .settings import settings


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def segment_path(meeting_id: str, user_id: str, seq: int) -> Path:
    base = Path(settings.RECORDINGS_DIR) / meeting_id / user_id / "segments"
    ensure_dir(base)
    return base / f"{seq:09d}.webm"  # zero-pad for lexicographic order


def merged_paths(meeting_id: str, user_id: str):
    base = Path(settings.RECORDINGS_DIR) / meeting_id / user_id
    ensure_dir(base)
    return base / "merged.webm", base / "merged.wav"


def build_ffmpeg_concat_file(segments_dir: Path) -> Path:
    files = sorted(segments_dir.glob("*.webm"))
    concat_txt = segments_dir / "concat.txt"
    with concat_txt.open("w", encoding="utf-8") as f:
        for p in files:
            f.write(f"file '{p.as_posix()}'\n")
    return concat_txt


def merge_segments_to_webm_and_wav(meeting_id: str, user_id: str):
    user_dir = Path(settings.RECORDINGS_DIR) / meeting_id / user_id
    segments_dir = user_dir / "segments"
    if not segments_dir.exists():
        raise FileNotFoundError("No segments directory found")

    webm_out, wav_out = merged_paths(meeting_id, user_id)
    concat_txt = build_ffmpeg_concat_file(segments_dir)

    # Merge webm segments
    cmd_merge = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0",
        "-i", str(concat_txt),
        "-c", "copy",
        str(webm_out),
    ]
    proc = subprocess.run(cmd_merge, capture_output=True)
    if proc.returncode != 0:
        # fallback re-encode
        cmd_merge = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_txt),
            "-c:v", "copy",
            "-c:a", "libopus",
            str(webm_out),
        ]
        subprocess.check_call(cmd_merge)

    # Convert to WAV for Whisper
    cmd_wav = [
        "ffmpeg", "-y",
        "-i", str(webm_out),
        "-ac", "1",
        "-ar", "16000",
        str(wav_out),
    ]
    subprocess.check_call(cmd_wav)

    return webm_out, wav_out

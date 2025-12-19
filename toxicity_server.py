import sys
import json
import traceback

# Force UTF-8 encoding for stdin/stdout
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')

def install_and_import():
    try:
        from detoxify import Detoxify
        return Detoxify
    except ImportError:
        return None

def main():
    print(json.dumps({"status": "loading", "message": "Loading Detoxify model..."}), flush=True)
    
    Detoxify = install_and_import()
    if not Detoxify:
        print(json.dumps({"status": "error", "message": "Module 'detoxify' not found. Run: pip install detoxify"}), flush=True)
        return

    try:
        # Load multilingual model (supports Russian)
        model = Detoxify('multilingual')
        print(json.dumps({"status": "ready", "message": "Model loaded"}), flush=True)
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Failed to load model: {str(e)}"}), flush=True)
        return

    # Main loop
    for line in sys.stdin:
        try:
            if not line.strip():
                continue
                
            data = json.loads(line)
            text = data.get('text', '')
            
            if not text:
                print(json.dumps({"error": "No text provided"}), flush=True)
                continue

            # Predict
            results = model.predict(text)
            
            # Convert numpy floats to python floats
            sanitized = {k: float(v) for k, v in results.items()}
            
            print(json.dumps({"status": "ok", "results": sanitized}), flush=True)
            
        except json.JSONDecodeError:
            print(json.dumps({"status": "error", "message": "Invalid JSON input"}), flush=True)
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}), flush=True)

if __name__ == "__main__":
    main()

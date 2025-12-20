import sys
import json
import traceback

# Force UTF-8 encoding for stdin/stdout
if sys.version_info[0] >= 3:
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')

def install_and_import():
    try:
        from detoxify import Detoxify
        return Detoxify
    except ImportError:
        return None

def main():
    # Check Python version
    if sys.version_info[0] < 3:
        sys.stderr.write("Error: This script requires Python 3. Please run with python3.\n")
        sys.exit(1)

    print(json.dumps({"status": "loading", "message": "Loading Detoxify model..."}))
    sys.stdout.flush()
    
    Detoxify = install_and_import()
    if not Detoxify:
        print(json.dumps({"status": "error", "message": "Module 'detoxify' not found. Run: pip install detoxify"}))
        sys.stdout.flush()
        return

    try:
        # Load multilingual model (supports Russian)
        model = Detoxify('multilingual')
        print(json.dumps({"status": "ready", "message": "Model loaded"}))
        sys.stdout.flush()
    except Exception as e:
        print(json.dumps({"status": "error", "message": f"Failed to load model: {str(e)}"}))
        sys.stdout.flush()
        return

    # Main loop
    for line in sys.stdin:
        try:
            if not line.strip():
                continue
                
            data = json.loads(line)
            text = data.get('text', '')
            req_id = data.get('id')
            
            if not text:
                print(json.dumps({"error": "No text provided", "id": req_id}))
                sys.stdout.flush()
                continue

            # Predict
            results = model.predict(text)
            
            # Convert numpy floats to python floats
            sanitized = {k: float(v) for k, v in results.items()}
            
            print(json.dumps({"status": "ok", "results": sanitized, "id": req_id}))
            sys.stdout.flush()
            
        except json.JSONDecodeError:
            print(json.dumps({"status": "error", "message": "Invalid JSON input"}))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()

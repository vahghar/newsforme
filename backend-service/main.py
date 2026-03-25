from fastapi import FastAPI, HTTPException
import subprocess
import os
import sys
import json

app = FastAPI(title="Flario Agentverse Backend")

@app.get("/")
def read_root():
    return {"status": "Flario Python Backend is running!"}

@app.get("/api/tavily")
def run_tavily(query: str):
    if not query:
        raise HTTPException(status_code=400, detail="Missing query parameter")
        
    try:
        # Resolve path to the scripts/tavily_search.py inside the backend-service folder
        script_path = os.path.join(os.path.dirname(__file__), 'scripts', 'tavily_search.py')

        # Run the script exactly as you originally wrote it via terminal
        out = subprocess.run([sys.executable, script_path, query], capture_output=True, text=True, timeout=30)
        
        stdout = out.stdout
        startMarker = "AgentResponseOutputStart---"
        endMarker = "---AgentResponseOutputEnd"
        
        # Capture the print() output from the python script
        if startMarker in stdout and endMarker in stdout:
            jsonStr = stdout.split(startMarker)[1].split(endMarker)[0].strip()
            return json.loads(jsonStr)
        else:
            raise HTTPException(status_code=500, detail=f"Failed to parse script output. stdout: {stdout}, stderr: {out.stderr}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/tech_analysis")
def run_tech_analysis(ticker: str):
    if not ticker:
        raise HTTPException(status_code=400, detail="Missing ticker parameter")
        
    try:
        script_path = os.path.join(os.path.dirname(__file__), 'scripts', 'get_tech_analysis.py')

        out = subprocess.run([sys.executable, script_path, ticker], capture_output=True, text=True, timeout=30)
        
        stdout = out.stdout
        startMarker = "AgentResponseOutputStart---"
        endMarker = "---AgentResponseOutputEnd"
        
        if startMarker in stdout and endMarker in stdout:
            jsonStr = stdout.split(startMarker)[1].split(endMarker)[0].strip()
            return json.loads(jsonStr)
        else:
            raise HTTPException(status_code=500, detail=f"Failed to parse script output. stdout: {stdout}, stderr: {out.stderr}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

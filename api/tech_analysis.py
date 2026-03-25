from http.server import BaseHTTPRequestHandler
import urllib.parse
import json
import subprocess
import os
import sys

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            parsed_path = urllib.parse.urlsplit(self.path)
            query_params = urllib.parse.parse_qs(parsed_path.query)
            ticker = query_params.get('ticker', [''])[0]
            
            if not ticker:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing ticker parameter"}).encode('utf-8'))
                return
                
            # Calculate absolute path explicitly, avoiding working directory issues in Vercel's AWS Lambda
            api_dir = os.path.dirname(os.path.abspath(__file__))
            root_dir = os.path.dirname(api_dir)
            script_path = os.path.join(root_dir, 'scripts', 'get_tech_analysis.py')
            
            # Execute the script
            out = subprocess.run([sys.executable, script_path, ticker], capture_output=True, text=True, timeout=25)
            
            stdout = out.stdout
            
            # Extract JSON from stdout
            startMarker = "AgentResponseOutputStart---"
            endMarker = "---AgentResponseOutputEnd"
            
            if startMarker in stdout and endMarker in stdout:
                jsonStr = stdout.split(startMarker)[1].split(endMarker)[0].strip()
                data = json.loads(jsonStr)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(data).encode('utf-8'))
            else:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "Failed to parse script output", 
                    "stdout": stdout, 
                    "stderr": out.stderr
                }).encode('utf-8'))
                
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))

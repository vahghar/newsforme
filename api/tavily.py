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
            q = query_params.get('query', [''])[0]
            
            if not q:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing query parameter"}).encode('utf-8'))
                return
                
            # Path to the original working script
            script_path = os.path.join(os.getcwd(), 'scripts', 'tavily_search.py')
            
            # Execute the original script exactly as Next.js was trying to do, 
            # but inside the Vercel Python environment which has Python natively installed!
            out = subprocess.run([sys.executable, script_path, q], capture_output=True, text=True, timeout=25)
            
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

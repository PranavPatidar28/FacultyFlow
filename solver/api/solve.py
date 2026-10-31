from http.server import BaseHTTPRequestHandler
import hmac
import json
import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engine import solve
from repair import solve_repair


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        secret = os.environ.get("SOLVER_SECRET", "")
        if not secret or not hmac.compare_digest(self.headers.get("Authorization", ""), f'Bearer {secret}'):
            return self.respond(401, {"error": "Unauthorized"})
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > 4_000_000:
            return self.respond(413, {"error": "Invalid request size"})
        try:
            data = json.loads(self.rfile.read(length))
            if len(data["faculty"]) > 150 or len(data["sections"]) > 60 or len(data["requirements"]) > 600:
                return self.respond(422, {"error": "Pilot size limit exceeded"})
            if data.get("mode") == "repair" and len(data.get("occurrences", [])) > 1000:
                return self.respond(422, {"error": "Daily repair size limit exceeded"})
            self.respond(200, solve_repair(data) if data.get("mode") == "repair" else solve(data))
        except (KeyError, TypeError, ValueError) as error:
            self.respond(422, {"error": f'Invalid solver input: {type(error).__name__}'})
        except Exception:
            self.respond(500, {"error": "Solver failed"})

    def do_GET(self):
        self.respond(200, {"service": "FacultyFlow solver", "status": "ready"})

    def respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    from http.server import ThreadingHTTPServer
    ThreadingHTTPServer(("127.0.0.1", 8001), handler).serve_forever()

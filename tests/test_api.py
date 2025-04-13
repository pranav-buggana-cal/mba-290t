#!/usr/bin/env python3
import os
import time
import subprocess
import requests
import json
import sys
from pathlib import Path


class CompetitorAnalysisTest:
    def __init__(self):
        self.proxy_url = "http://localhost:3001"
        self.api_url = (
            "https://competitor-analysis-backend-342114956303.us-central1.run.app"
        )
        self.proxy_process = None
        self.frontend_process = None
        self.token = None
        self.test_results = []

    def setup(self):
        print("Starting proxy server...")
        try:
            # Start proxy server in background
            self.proxy_process = subprocess.Popen(
                ["npm", "start"],
                cwd="proxy",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )

            # Wait for proxy to start
            time.sleep(5)

            # Check if proxy is running
            response = requests.get(f"{self.proxy_url}/health")
            if response.status_code != 200:
                self.log_test(
                    "Proxy server health check",
                    False,
                    f"Expected status code 200, got {response.status_code}",
                )
                return False

            self.log_test("Proxy server started", True)
            return True
        except Exception as e:
            self.log_test("Proxy server startup", False, str(e))
            return False

    def get_credentials(self):
        print("Retrieving authentication credentials...")
        try:
            # Get credentials from Google Secret Manager
            username = (
                subprocess.check_output(
                    [
                        "gcloud",
                        "secrets",
                        "versions",
                        "access",
                        "latest",
                        "--secret=auth-username",
                    ]
                )
                .decode()
                .strip()
            )

            password = (
                subprocess.check_output(
                    [
                        "gcloud",
                        "secrets",
                        "versions",
                        "access",
                        "latest",
                        "--secret=auth-password",
                    ]
                )
                .decode()
                .strip()
            )

            self.log_test("Retrieved credentials", True)
            return username, password
        except Exception as e:
            self.log_test("Credential retrieval", False, str(e))
            return None, None

    def test_authentication(self):
        print("Testing authentication endpoint...")
        try:
            username, password = self.get_credentials()
            if not username or not password:
                return False

            response = requests.post(
                f"{self.proxy_url}/api/token",
                data={"username": username, "password": password},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

            if response.status_code != 200:
                self.log_test(
                    "Authentication endpoint",
                    False,
                    f"Expected status code 200, got {response.status_code}",
                )
                return False

            self.token = response.json().get("access_token")
            if not self.token:
                self.log_test("Authentication token", False, "No token received")
                return False

            self.log_test("Authentication endpoint", True)
            return True
        except Exception as e:
            self.log_test("Authentication endpoint", False, str(e))
            return False

    def test_document_upload(self):
        print("Testing document upload endpoint...")
        try:
            if not self.token:
                self.log_test(
                    "Document upload", False, "No authentication token available"
                )
                return False

            # Create a test file if it doesn't exist
            test_file_path = Path("test.txt")
            if not test_file_path.exists():
                with open(test_file_path, "w") as f:
                    f.write("Test document content")

            files = {"files": open(test_file_path, "rb")}
            headers = {"Authorization": f"Bearer {self.token}"}

            response = requests.post(
                f"{self.proxy_url}/api/upload-documents", files=files, headers=headers
            )

            if response.status_code != 200:
                self.log_test(
                    "Document upload",
                    False,
                    f"Expected status code 200, got {response.status_code}",
                )
                return False

            if (
                "message" not in response.json()
                or "Documents processed successfully" not in response.json()["message"]
            ):
                self.log_test("Document upload", False, "Unexpected response message")
                return False

            self.log_test("Document upload", True)
            return True
        except Exception as e:
            self.log_test("Document upload", False, str(e))
            return False
        finally:
            # Close the file if it was opened
            if "files" in locals() and files["files"]:
                files["files"].close()

    def test_competitor_analysis(self):
        print("Testing competitor analysis endpoint...")
        try:
            if not self.token:
                self.log_test(
                    "Competitor analysis", False, "No authentication token available"
                )
                return False

            headers = {"Authorization": f"Bearer {self.token}"}
            params = {"query": "Who are the main competitors"}

            response = requests.post(
                f"{self.proxy_url}/api/analyze-competitors",
                headers=headers,
                params=params,
            )

            if response.status_code != 200:
                self.log_test(
                    "Competitor analysis",
                    False,
                    f"Expected status code 200, got {response.status_code}",
                )
                return False

            data = response.json()
            if "document_path" not in data or "message" not in data:
                self.log_test(
                    "Competitor analysis", False, "Unexpected response format"
                )
                return False

            # Store the document path for the next test
            self.document_path = data["document_path"]

            self.log_test("Competitor analysis", True)
            return True
        except Exception as e:
            self.log_test("Competitor analysis", False, str(e))
            return False

    def test_document_download(self):
        print("Testing document download endpoint...")
        try:
            if not self.token:
                self.log_test(
                    "Document download", False, "No authentication token available"
                )
                return False

            if not hasattr(self, "document_path"):
                self.log_test("Document download", False, "No document path available")
                return False

            headers = {"Authorization": f"Bearer {self.token}"}

            # Remove leading slash if present
            path = (
                self.document_path[1:]
                if self.document_path.startswith("/")
                else self.document_path
            )
            response = requests.get(f"{self.proxy_url}/api/{path}", headers=headers)

            if response.status_code != 200:
                self.log_test(
                    "Document download",
                    False,
                    f"Expected status code 200, got {response.status_code}",
                )
                return False

            # Save the downloaded file
            with open("analysis.docx", "wb") as f:
                f.write(response.content)

            self.log_test("Document download", True)
            return True
        except Exception as e:
            self.log_test("Document download", False, str(e))
            return False

    def teardown(self):
        print("Cleaning up resources...")
        if self.proxy_process:
            self.proxy_process.terminate()

        print("\nTest Results:")
        for test in self.test_results:
            status = "PASS" if test["result"] else "FAIL"
            print(f"{status}: {test['name']}")
            if not test["result"] and "error" in test:
                print(f"  Error: {test['error']}")

        # Return True if all tests passed, False otherwise
        return all(test["result"] for test in self.test_results)

    def log_test(self, test_name, result, error=None):
        test_result = {"name": test_name, "result": result}
        if error:
            test_result["error"] = error
        self.test_results.append(test_result)

        status = "PASS" if result else "FAIL"
        print(f"{status}: {test_name}")
        if not result and error:
            print(f"  Error: {error}")

    def run_tests(self):
        try:
            if not self.setup():
                return False

            if not self.test_authentication():
                return False

            if not self.test_document_upload():
                return False

            if not self.test_competitor_analysis():
                return False

            if not self.test_document_download():
                return False

            return True
        finally:
            success = self.teardown()
            return success


if __name__ == "__main__":
    tester = CompetitorAnalysisTest()
    success = tester.run_tests()
    sys.exit(0 if success else 1)

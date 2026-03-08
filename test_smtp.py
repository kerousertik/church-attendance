import os
from dotenv import load_dotenv
import smtplib

load_dotenv()
email = os.environ.get("SENDER_EMAIL")
pwd = os.environ.get("SENDER_PASSWORD")

print(f"Env Email: {email}")
print(f"Env Pwd: {pwd}")

try:
    print("Connecting to gmail...")
    server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
    server.set_debuglevel(1)
    print("Logging in...")
    server.login(email, pwd)
    print("Login success!")
except Exception as e:
    print(f"FAILED: {e}")

import smtplib
import ssl
import os
import sys
from email.message import EmailMessage

# ─── Send Mass Email via Gmail SMTP ──────────────────────────────────────────
# Usage:
#   python scripts/send-email-gmail.py
#
# The script will interactively ask you for:
#   1. Your Gmail Address
#   2. Your Gmail 16-character App Password (from https://myaccount.google.com/apppasswords)
#   3. Email Subject
#   4. Email Message / Body Text
# ─────────────────────────────────────────────────────────────────────────────

def get_multiline_input(prompt):
    print(prompt)
    print("   (Press ENTER then CTRL+Z on Windows or CTRL+D on Mac/Linux when finished):")
    lines = sys.stdin.read()
    return lines.strip()

def send_emails():
    txt_path = os.path.join(os.path.dirname(__file__), '..', 'user_emails.txt')
    if not os.path.exists(txt_path):
        print("❌ user_emails.txt not found! Run 'node scripts/export-user-emails.mjs' first.")
        return

    with open(txt_path, 'r', encoding='utf-8') as f:
        recipients = [line.strip() for line in f if line.strip()]

    if not recipients:
        print("⚠️ No recipients found in user_emails.txt.")
        return

    print(f"\n📧 Loaded {len(recipients)} recipient emails from user_emails.txt\n")

    gmail_address = input("✉️  Enter your Gmail address: ").strip()
    if not gmail_address:
        print("❌ Gmail address cannot be empty.")
        return

    gmail_app_password = input("🔑 Enter your 16-character Gmail App Password: ").strip().replace(' ', '')
    if not gmail_app_password:
        print("❌ App password cannot be empty.")
        return

    subject = input("\n📌 Enter Email Subject: ").strip()
    if not subject:
        print("❌ Subject cannot be empty.")
        return

    print("\n📝 Enter Email Body / Message Text:")
    print("--------------------------------------------------")
    print("Type or paste your full message below.")
    print("When finished, press ENTER and then CTRL+Z (on Windows) or CTRL+D (on Mac/Linux):")
    print("--------------------------------------------------")

    body_text = sys.stdin.read().strip()
    if not body_text:
        print("❌ Message body cannot be empty.")
        return

    print("\n--- PREVIEW ---")
    print(f"To: {len(recipients)} users")
    print(f"From: {gmail_address}")
    print(f"Subject: {subject}")
    print(f"Body:\n{body_text}")
    print("---------------\n")

    confirm = input("⚠️ Send this email to ALL recipients? (y/n): ").strip().lower()
    if confirm not in ['y', 'yes']:
        print("❌ Aborted by user. No emails were sent.")
        return

    print(f"\n🚀 Sending emails via Gmail ({gmail_address})...\n")

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(gmail_address, gmail_app_password)
            
            for email in recipients:
                msg = EmailMessage()
                msg['Subject'] = subject
                msg['From'] = f"Keeguard <{gmail_address}>"
                msg['To'] = email
                msg.set_content(body_text)

                server.send_message(msg)
                print(f" ✅ Email sent to: {email}")

        print("\n🎉 All emails sent successfully!")
    except Exception as e:
        print(f"\n❌ Error sending emails: {e}")
        print("\n💡 Tip: Make sure you created a 16-character App Password from https://myaccount.google.com/apppasswords")

if __name__ == "__main__":
    send_emails()

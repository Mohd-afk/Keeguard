import smtplib
import ssl
import os
from email.message import EmailMessage

# ─── Send Free Mass Email via Gmail SMTP ─────────────────────────────────────
# Cost: $0 (Uses your regular Gmail account — up to 500 emails/day for free)
#
# STEP 1: Enable 2-Step Verification on your Gmail account.
# STEP 2: Generate an "App Password" at: https://myaccount.google.com/apppasswords
# STEP 3: Set your credentials below and run: python scripts/send-email-gmail.py
# ─────────────────────────────────────────────────────────────────────────────

GMAIL_ADDRESS = "YOUR_GMAIL@gmail.com"        # Replace with your Gmail address
GMAIL_APP_PASSWORD = "xxxx xxxx xxxx xxxx"    # Replace with your 16-digit Gmail App Password

SUBJECT = "⚠️ Keeguard Maintenance Notice & Update"
BODY_TEXT = """Hello Keeguard User,

We are performing scheduled maintenance over the next few days to roll out new security updates and features!

Please note:
- The app will be receiving an update. Please keep your app updated to the latest version.
- If you notice any brief downtime, don't worry — your data is safe and encrypted.

Thank you for using Keeguard!
The Keeguard Team
"""

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

    print(f"📧 Loaded {len(recipients)} recipient emails from user_emails.txt")
    print(f"🚀 Sending via Gmail ({GMAIL_ADDRESS})...\n")

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            
            for email in recipients:
                msg = EmailMessage()
                msg['Subject'] = SUBJECT
                msg['From'] = f"Keeguard <{GMAIL_ADDRESS}>"
                msg['To'] = email
                msg.set_content(BODY_TEXT)

                server.send_message(msg)
                print(f" ✅ Email sent to: {email}")

        print("\n🎉 All emails sent successfully for $0 cost!")
    except Exception as e:
        print(f"\n❌ Error sending emails: {e}")
        print("\n💡 Tip: Make sure you created a 16-character 'App Password' from https://myaccount.google.com/apppasswords")

if __name__ == "__main__":
    send_emails()

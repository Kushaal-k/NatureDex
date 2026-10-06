"""Create a local QR image for the private link; never serve it publicly."""
from pathlib import Path
import qrcode
from qrcode.constants import ERROR_CORRECT_M

def save_phone_qr(link: str, directory: Path):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=8, border=4)
    qr.add_data(link)
    qr.make(fit=True)
    target = directory / "phone-qr.png"
    qr.make_image(fill_color="#234d38", back_color="white").save(target)
    return target

if __name__ == "__main__":
    directory = Path(__file__).resolve().parents[1] / ".mobile"
    link = (directory / "phone-link.txt").read_text(encoding="utf-8").strip()
    print("Private phone QR saved:", save_phone_qr(link, directory))

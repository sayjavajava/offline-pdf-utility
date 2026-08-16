#!/usr/bin/env python3
"""Generate the encrypted PDF fixtures used by the decryption tests.

Every other fixture in the suite is built in-memory with pdf-lib at test time
(see src/test/fixtures.ts). These three cannot be: pdf-lib -- and the
@cantoo/pdf-lib fork we decrypt with -- can *read* encryption but not *write*
it, so there is no way to produce an encrypted input from inside the test run.
They are therefore generated here, once, and committed.

Re-generate with:

    python3 -m venv .venv && .venv/bin/pip install pypdf cryptography
    .venv/bin/python scripts/generate-encrypted-fixtures.py

The output is byte-stable for a given pypdf version. If a regenerated fixture
differs, that is a pypdf change, not a test failure -- check it in deliberately.

Each fixture has three pages with deliberately distinct dimensions
(200x200, 300x300, 400x400) so a test can assert *which* pages survived an
operation, not merely how many.
"""

from pathlib import Path

from pypdf import PdfWriter

OUT_DIR = Path(__file__).resolve().parent.parent / "src" / "test" / "fixtures"
PAGE_SIZES = [(200, 200), (300, 300), (400, 400)]

# Kept in sync with PASSWORD in src/test/fixtures.ts.
PASSWORD = "correct-horse"
OWNER_PASSWORD = "owner-secret"


def build_writer() -> PdfWriter:
    writer = PdfWriter()
    for width, height in PAGE_SIZES:
        writer.add_blank_page(width=width, height=height)
    return writer


def write(name: str, **encrypt_kwargs) -> None:
    writer = build_writer()
    writer.encrypt(**encrypt_kwargs)
    target = OUT_DIR / name
    with target.open("wb") as fh:
        writer.write(fh)
    print(f"  {name:<34} {target.stat().st_size:>6} bytes")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Writing encrypted fixtures to {OUT_DIR}")

    # RC4-128 and AES-256 exercise both cipher families the fork's
    # CipherTransformFactory implements, so a regression in either is caught.
    write("encrypted-rc4-128.pdf", user_password=PASSWORD, algorithm="RC4-128")
    write("encrypted-aes-256.pdf", user_password=PASSWORD, algorithm="AES-256")

    # Encrypted with an *empty* user password. This is the case that breaks if
    # the loader treats '' as "no password given" -- the bug the audit's P0-3
    # calls out in `password || undefined`. The file is genuinely encrypted and
    # genuinely opens with '', so collapsing the two states fails here.
    write(
        "encrypted-empty-password.pdf",
        user_password="",
        owner_password=OWNER_PASSWORD,
        algorithm="AES-256",
    )


if __name__ == "__main__":
    main()

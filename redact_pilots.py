import re
import hmac
import hashlib
import sys
import random

# Configuration
import os
INPUT_FILE = os.environ.get('INPUT_FILE', 'pilots.rtf')
SECRET_KEY = os.environ.get('SECRET_KEY', '').encode('utf-8')
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable must be set")
SAMPLE_SIZE = 20

# Regex to correspond to columns:
# Pos, Sen#, Name, ID#, Dom, Eqp, Seat, Award
# Updated regex:
# - \s+ between Name and ID
# - Seat column (group 7) allows '/' for "F/O"
ROW_PATTERN = re.compile(r'(\d+)\s+(\d+)\s+(.+?)\s+(\d{7})\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+([A-Z0-9/]+)\s+(\d+)')


def obfuscate_id(original_id, secret):
    """
    Hashes the original 7-digit ID using HMAC-SHA256.
    Returns first 14 hex characters for collision resistance.
    """
    h = hmac.new(secret, original_id.encode('utf-8'), hashlib.sha256)
    return h.hexdigest()[:14]
def obfuscate_name(original_name, seed_val, secret):
    """
    Generates a synthetic name deterministically from the original name using secret and seed.
    """
    last_names = [
        "SMITH", "JOHNSON", "WILLIAMS", "BROWN", "JONES", "GARCIA", "MILLER", "DAVIS", "RODRIGUEZ", "MARTINEZ",
        "HERNANDEZ", "LOPEZ", "GONZALEZ", "WILSON", "ANDERSON", "THOMAS", "TAYLOR", "MOORE", "JACKSON", "MARTIN",
        "LEE", "PEREZ", "THOMPSON", "WHITE", "HARRIS", "SANCHEZ", "CLARK", "RAMIREZ", "LEWIS", "ROBINSON",
        "WALKER", "YOUNG", "ALLEN", "KING", "WRIGHT", "SCOTT", "TORRES", "NGUYEN", "HILL", "FLORES",
        "GREEN", "ADAMS", "NELSON", "BAKER", "HALL", "RIVERA", "CAMPBELL", "MITCHELL", "CARTER", "ROBERTS",
        "GOMEZ", "PHILLIPS", "EVANS", "TURNER", "DIAZ", "PARKER", "CRUZ", "EDWARDS", "COLLINS", "REYES",
        "STEWART", "MORRIS", "MORALES", "MURPHY", "COOK", "ROGERS", "GUTIERREZ", "ORTIZ", "MORGAN", "COOPER",
        "PETERSON", "BAILEY", "REED", "KELLY", "HOWARD", "RAMOS", "KIM", "COX", "WARD", "RICHARDSON",
        "WATSON", "BROOKS", "CHAVEZ", "WOOD", "JAMES", "BENNETT", "GRAY", "MENDOZA", "RUIZ", "HUGHES",
        "PRICE", "ALVAREZ", "CASTILLO", "SANDERS", "PATEL", "MYERS", "LONG", "ROSS", "FOSTER", "JIMENEZ"
    ]
    first_names = [
        "JAMES", "ROBERT", "JOHN", "MICHAEL", "DAVID", "WILLIAM", "RICHARD", "JOSEPH", "THOMAS", "CHARLES",
        "CHRISTOPHER", "DANIEL", "MATTHEW", "ANTHONY", "MARK", "DONALD", "STEVEN", "PAUL", "ANDREW", "JOSHUA",
        "KENNETH", "KEVIN", "BRIAN", "GEORGE", "TIMOTHY", "RONALD", "EDWARD", "JASON", "JEFFREY", "RYAN",
        "JACOB", "GARY", "NICHOLAS", "ERIC", "JONATHAN", "STEPHEN", "LARRY", "JUSTIN", "SCOTT", "BRANDON",
        "BENJAMIN", "SAMUEL", "GREGORY", "ALEXANDER", "FRANK", "PATRICK", "RAYMOND", "JACK", "DENNIS", "JERRY",
        "TYLER", "AARON", "JOSE", "ADAM", "HENRY", "NATHAN", "DOUGLAS", "ZACHARY", "PETER", "KYLE",
        "ETHAN", "WALTER", "NOAH", "JEREMY", "CHRISTIAN", "KEITH", "ROGER", "TERRY", "GERALD", "HAROLD",
        "SEAN", "AUSTIN", "CARL", "ARTHUR", "LAWRENCE", "DYLAN", "JESSE", "JORDAN", "BRYAN", "BILLY",
        "JOE", "BRUCE", "GABRIEL", "LOGAN", "ALBERT", "WILLIE", "ALAN", "JUAN", "WAYNE", "ELIJAH",
        "RANDY", "ROY", "VINCENT", "RALPH", "EUGENE", "RUSSELL", "BOBBY", "MASON", "PHILIP", "LOUIS"
    ]
    middle_initials = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    
    # Use HMAC with secret for secure deterministic generation
    # seed_val is typically the pilot_id
    # We include original_name in the hash input logic to ensure that if a pilot somehow has same ID (unlikely) 
    # but different name, they get different outputs, though mostly rely on ID/seed.
    msg = f"{original_name}{seed_val}".encode('utf-8')
    h = hmac.new(secret, msg, hashlib.sha256).hexdigest()
    h_int = int(h, 16)
    
    ln_idx = h_int % len(last_names)
    fn_idx = (h_int // 1000) % len(first_names)
    mi_idx = (h_int // 1000000) % len(middle_initials)
    
    return f"{last_names[ln_idx]}, {first_names[fn_idx]} {middle_initials[mi_idx]}."

def process_line(line, secret):
    """
    Finds all pilot entries in a line and redacts them.
    Returns a list of redacted dictionaries.
    """
    results = []
    # Find all matches in the line
    matches = ROW_PATTERN.findall(line)
    
    for m in matches:
        pos, sen, name, pilot_id, dom, eqp, seat, award = m
        
        redacted_id = obfuscate_id(pilot_id, secret)
        redacted_name = obfuscate_name(name, pilot_id, secret) # Use ID as seed for name stability
        
        results.append({
            "Pos": pos,
            "Sen#": sen,
            "Original_Name": "REDACTED", # Don't store original in output dict
            "Name_Synthetic": redacted_name,
            "Original_ID": "REDACTED",
            "ID_Synthetic": redacted_id,
            "Dom": dom,
            "Eqp": eqp,
            "Seat": seat,
            "Award": award
        })
    return results

def main():
    print(f"Reading from: {INPUT_FILE}")
    print("-" * 60)
    
    data_rows = []
    
    try:
        with open(INPUT_FILE, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                if not line.strip():
                    continue
                
                # Extract data
                extracted = process_line(line, SECRET_KEY)
                data_rows.extend(extracted)
                
    except FileNotFoundError:
        print(f"Error: File not found at {INPUT_FILE}")
        sys.exit(1)
        
    print(f"Found {len(data_rows)} pilot entries.")
    print("-" * 60)
    print("SAMPLE OUTPUT (Top 20 generated rows):")
    print(f"{'Pos':<5} {'Sen#':<5} {'Name':<25} {'ID#':<10} {'Dom':<5} {'Eqp':<5} {'Seat':<5} {'Award':<5}")
    print("-" * 80)
    
    # We take top 20
    for row in data_rows[:SAMPLE_SIZE]:
        print(f"{row['Pos']:<5} {row['Sen#']:<5} {row['Name_Synthetic']:<25} {row['ID_Synthetic']:<10} {row['Dom']:<5} {row['Eqp']:<5} {row['Seat']:<5} {row['Award']:<5}")

    print("\n" + "="*30)
    print("DATA DICTIONARY / SCHEMA")
    print("="*30)
    print("1. Pos            : Position number (Original)")
    print("2. Sen#           : Seniority number (Original)")
    print("3. Name           : Full Name (SYNTHETIC - Format 'LAST, FIRST M.')")
    print("   * Transformation : Mapped deterministically from name/ID hash to expanded pools (100 Sur, 100 Giv, 26 MI = 260k combos).")
    print("4. ID#            : Employee ID (HASHED - 14 hex characters)")
    print("   * Transformation : HMAC-SHA256(Original_ID, Secret) truncated to 14 hex chars.")
    print("5. Dom            : Domicile (Original)")
    print("6. Eqp            : Equipment (Original)")
    print("7. Seat           : Seat (Original - e.g., CPT, F/O)")
    print("8. Award          : Award line number (Original)")

if __name__ == "__main__":
    main()

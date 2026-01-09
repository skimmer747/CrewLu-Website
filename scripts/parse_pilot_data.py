#!/usr/bin/env python3
"""
Parse pilot seniority data from PDF or RTF files and convert to JSON format.

This script reads either a PDF or RTF file containing pilot seniority data and 
converts it to a structured JSON format organized by:
    Equipment Type → Domicile → Seat (CPT/FO)

Usage:
    python scripts/parse_pilot_data.py

Input: 
    - PDF file: 26-02 Updated Senlist.pdf (or similar)
    - RTF file: All pilots 1252025.rtf (legacy format)
    
Output: 
    - assets/data/pilot-data.json (JSON format for fetch requests)
    - assets/js/pilot-data.js (JS variable for direct browser loading)
"""

import re
import json
import os
import sys
from pathlib import Path

# ============================================================================
# CONFIGURATION - Update the INPUT_FILE path when you have a new seniority list
# ============================================================================

# Get the project root directory (parent of scripts directory)
PROJECT_ROOT = Path(__file__).parent.parent

# Input file - supports both PDF and RTF formats
# Change this filename when you have a new seniority list PDF
INPUT_FILE = PROJECT_ROOT / "26-02 Updated Senlist.pdf"

# Legacy RTF file (fallback if PDF not found)
LEGACY_RTF_FILE = PROJECT_ROOT / "All pilots 1252025.rtf"

# Output files
OUTPUT_JSON = PROJECT_ROOT / "assets" / "data" / "pilot-data.json"
OUTPUT_JS = PROJECT_ROOT / "assets" / "js" / "pilot-data.js"


# ============================================================================
# RTF PARSING FUNCTIONS (Legacy support)
# ============================================================================

def strip_rtf_formatting(text):
    """
    Remove RTF formatting codes from text.
    
    RTF files contain control codes like \rtf1, \ansi that we need to strip out
    to get the plain text content underneath.
    
    Args:
        text: Raw RTF file content
        
    Returns:
        Plain text with RTF codes removed
    """
    # Remove RTF control words (like \rtf1, \ansi, etc.)
    text = re.sub(r'\\[a-z]+\d*\s?', '', text)
    # Remove RTF control symbols (like \{, \}, etc.)
    text = re.sub(r'\\[^a-z]', '', text)
    # Remove braces used in RTF grouping
    text = text.replace('{', '').replace('}', '')
    # Collapse multiple whitespace into single space
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


# ============================================================================
# PDF PARSING FUNCTIONS
# ============================================================================

def parse_pdf_file(file_path):
    """
    Parse a PDF file and extract all pilot seniority data.
    
    Uses pdfplumber library to extract text from each page of the PDF,
    then processes each line to find pilot data entries.
    
    Args:
        file_path: Path to the PDF file
        
    Returns:
        dict organized as {equipment: {domicile: {seat: [pilots list]}}}
    """
    # Import pdfplumber here so we only need it when processing PDFs
    try:
        import pdfplumber
    except ImportError:
        print("ERROR: pdfplumber library not installed!")
        print("Please install it with: pip install pdfplumber")
        sys.exit(1)
    
    print(f"Reading PDF file: {file_path}")
    
    # Initialize the data structure that will hold all pilot records
    # Organized as: Equipment Type -> Domicile -> Seat -> [list of pilots]
    data = {}
    
    # Extract the date from the PDF (stored in metadata)
    list_date = None
    
    # Keep track of which section we're in (CPT or F/O)
    # This helps when the seat isn't explicitly on every data line
    current_seat_section = None
    
    # Open the PDF and process each page
    with pdfplumber.open(file_path) as pdf:
        total_pages = len(pdf.pages)
        print(f"PDF has {total_pages} pages")
        
        for page_num, page in enumerate(pdf.pages, 1):
            # Extract text from this page
            text = page.extract_text()
            
            if not text:
                continue
            
            # Extract date from first few pages if not already found
            if not list_date and page_num <= 3:
                date_match = re.search(r'as of (\d{2}/\d{2}/\d{2})', text, re.IGNORECASE)
                if date_match:
                    list_date = date_match.group(1)
                    print(f"  Found list date: {list_date}")
            
            # Split into lines and process each one
            lines = text.split('\n')
            
            for line in lines:
                # Check if this line indicates a new seat section
                # PDF format uses lines like: "flj7sgr For SDF 74Y CPT's as of 01/25/26 SENIORIT"
                # or "flj7sgr For SDF 757 F/O's as of 01/25/26 SENIORIT"
                seat_match = re.search(r"(CPT'?s?|F/O'?s?)\s+as of", line, re.IGNORECASE)
                if seat_match:
                    seat_text = seat_match.group(1).upper()
                    if "CPT" in seat_text:
                        current_seat_section = 'CPT'
                    elif "F/O" in seat_text or "FO" in seat_text:
                        current_seat_section = 'FO'
                    else:
                        current_seat_section = None
                    
                    if current_seat_section:
                        print(f"  Page {page_num}: Found {current_seat_section} section")
                    continue
                
                # Also check for explicit "Seat: CPT" or "Seat: F/O" markers (RTF format)
                seat_match = re.search(r'Seat:\s*(CPT|F/O)', line, re.IGNORECASE)
                if seat_match:
                    current_seat_section = seat_match.group(1).upper()
                    if current_seat_section == 'F/O':
                        current_seat_section = 'FO'
                    print(f"  Page {page_num}: Found {current_seat_section} section")
                    continue
                
                # Try to parse pilot data from this line
                pilots = parse_pilot_line(line)
                
                # Add any pilots found to our data structure
                for pilot in pilots:
                    eqp = pilot['eqp']
                    dom = pilot['dom']
                    seat = pilot['seat'] or current_seat_section  # Use fallback if seat is missing
                    
                    # Normalize seat code: F/O -> FO for consistency (same as Seat: marker handling)
                    if seat == 'F/O':
                        seat = 'FO'
                    
                    # Skip this pilot if we still don't have a valid seat
                    if not seat:
                        continue
                    
                    # Create nested structure if it doesn't exist
                    if eqp not in data:
                        data[eqp] = {}
                    if dom not in data[eqp]:
                        data[eqp][dom] = {'CPT': [], 'FO': []}
                    
                    # Add pilot to the appropriate list
                    data[eqp][dom][seat].append(pilot)
    
    # Sort pilots by position number within each group
    # This ensures the data is in proper seniority order
    for eqp in data:
        for dom in data[eqp]:
            for seat in ['CPT', 'FO']:
                data[eqp][dom][seat].sort(key=lambda x: x['pos'])
    
    # Return both the data and the extracted date
    return data, list_date


# ============================================================================
# PILOT LINE PARSING (Used by both PDF and RTF)
# ============================================================================

def parse_pilot_line(line):
    """
    Parse a single line of text to extract pilot data entries.
    
    Supports two formats:
    1. OLD RTF format: Pos Sen# Name ID Dom Eqp Seat Award
    2. NEW PDF format: Cd Pos Sen# Name ID Dom Eqp Seat DOH DOB
    
    Each line can contain one or two pilot records arranged in columns.
    
    Args:
        line: A single line of text from the seniority list
        
    Returns:
        List of pilot dicts (can be 0, 1, or 2 pilots depending on the line)
    """
    pilots = []
    
    # Skip empty lines
    if not line.strip():
        return pilots
    
    # Skip header/metadata lines that don't contain pilot data
    skip_patterns = [
        'Cd Pos', 'Sen#', '---',        # Column headers (PDF format)
        'Pos', 'Sen#',                   # Column headers (RTF format)
        'Schedule Bid Awards',           # Page title
        'Page', 'Bid Period',            # Page metadata
        'Seat:',                          # Section markers
        'Equipment:', 'Domicile:',       # Other section markers
        'Fleet System',                  # Header text
        'UPS Seniority List'             # Title
    ]
    
    for pattern in skip_patterns:
        if pattern in line:
            return pilots
    
    # Try NEW PDF format first: Cd Pos Sen# Name ID Dom Eqp Seat DOH DOB
    # Cd can be: number, "NB", or empty
    # Pattern breakdown:
    #   (?:NB\s+)?     - Optional "NB " prefix (No Bid indicator)
    #   (\d+)           - Position number
    #   \s+(\d+)        - Seniority number
    #   \s+([A-Za-z\s\.,\'\-]+?(?:\s+(?:Jr\.?|Sr\.?|II|III|IV))?)  - Name (can have mixed case, Roman numerals, suffixes)
    #   \s+(\d{7})      - 7-digit employee ID
    #   \s+([A-Z0-9]+)  - Domicile code (SDF, ANC, etc.)
    #   \s+([A-Z0-9]+)  - Equipment code (74Y, 757, A30, etc.)
    #   \s+(CPT|F/O)    - Seat type
    #   \s+\d{2}/\d{2}/\d{2}  - DOH (Date of Hire) - MM/DD/YY format
    #   \s+\d{2}/\d{2}/\d{2}  - DOB (Date of Birth) - MM/DD/YY format
    # Note: Name pattern uses non-greedy match and stops before the 7-digit ID
    pdf_pattern = r'(?:NB\s+)?(\d+)\s+(\d+)\s+([A-Za-z\s\.,\'\-]+?(?:\s+(?:Jr\.?|Sr\.?|II|III|IV))?)\s+(\d{7})\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+(CPT|F/O)\s+\d{2}/\d{2}/\d{2}\s+\d{2}/\d{2}/\d{2}'
    
    matches = re.finditer(pdf_pattern, line)
    found_pdf_match = False
    
    for match in matches:
        found_pdf_match = True
        # Extract all the fields from the regex match
        pos = int(match.group(1))      # Position on this specific list
        sen = int(match.group(2))      # Company-wide seniority number
        name = match.group(3).strip()  # Pilot name
        pilot_id = match.group(4)      # Employee ID
        dom = match.group(5)           # Domicile (base)
        eqp = match.group(6)          # Equipment (aircraft type)
        seat = match.group(7)         # Seat position
        
        # Normalize seat code: F/O -> FO for consistency
        if seat == 'F/O':
            seat = 'FO'
        
        # Create the pilot record dictionary
        # Note: PDF format doesn't have award, so we use '*' as placeholder
        pilots.append({
            'pos': pos,      # Position on this equipment/domicile/seat list
            'sen': sen,      # Company seniority number (lower = more senior)
            'name': name,    # Full name in LASTNAME, FIRSTNAME format
            'id': pilot_id,  # 7-digit employee ID
            'dom': dom,      # Domicile code (SDF, ANC, MEM, CVG, etc.)
            'eqp': eqp,      # Equipment type (74Y, 757, A30, M1F, etc.)
            'seat': seat,    # CPT or FO
            'award': '*'     # PDF format doesn't include award, use placeholder
        })
    
    # If PDF pattern didn't match, try OLD RTF format: Pos Sen# Name ID Dom Eqp Seat Award
    if not found_pdf_match:
        # Pattern for RTF format (with Award field)
        rtf_pattern = r'\s*(\d+)\s+(\d+)\s+([A-Z\s\.,\'\-]+?)\s+(\d{7})\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+(CPT|F/O)\s+(\d+|\*)'
        
        matches = re.finditer(rtf_pattern, line)
        
        for match in matches:
            # Extract all the fields from the regex match
            pos = int(match.group(1))      # Position on this specific list
            sen = int(match.group(2))      # Company-wide seniority number
            name = match.group(3).strip()  # Pilot name
            pilot_id = match.group(4)      # Employee ID
            dom = match.group(5)           # Domicile (base)
            eqp = match.group(6)          # Equipment (aircraft type)
            seat = match.group(7)         # Seat position
            award = match.group(8)        # Award number
            
            # Normalize seat code: F/O -> FO for consistency
            if seat == 'F/O':
                seat = 'FO'
            
            # Create the pilot record dictionary
            pilots.append({
                'pos': pos,      # Position on this equipment/domicile/seat list
                'sen': sen,      # Company seniority number (lower = more senior)
                'name': name,    # Full name in LASTNAME, FIRSTNAME format
                'id': pilot_id,  # 7-digit employee ID
                'dom': dom,      # Domicile code (ANC, MEM, CVG, etc.)
                'eqp': eqp,      # Equipment type (74Y, M1F, etc.)
                'seat': seat,    # CPT or FO
                'award': award   # Award/bid number
            })
    
    return pilots


# ============================================================================
# RTF FILE PARSING (Legacy support)
# ============================================================================

def parse_rtf_file(file_path):
    """
    Parse an RTF file and extract all pilot seniority data.
    
    This is the legacy parsing function for RTF files. PDF parsing is now
    preferred as it's more reliable.
    
    Args:
        file_path: Path to the RTF file
        
    Returns:
        dict organized as {equipment: {domicile: {seat: [pilots list]}}}
    """
    print(f"Reading RTF file: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Initialize data structure
    data = {}
    current_seat = None
    
    # Split content by "Seat:" markers to find CPT and F/O sections
    sections = re.split(r'Seat:\s*', content, flags=re.IGNORECASE)
    
    print(f"Found {len(sections)} sections")
    
    for section in sections:
        if not section.strip():
            continue
        
        # Determine if this section is for CPT or F/O
        lines = section.split('\n')
        seat_type = None
        
        # Check first few lines for seat type indicator
        for line in lines[:5]:
            if 'CPT' in line.upper() and 'F/O' not in line.upper():
                seat_type = 'CPT'
                break
            elif 'F/O' in line.upper():
                seat_type = 'FO'
                break
        
        if not seat_type:
            continue
        
        current_seat = seat_type
        print(f"Processing {current_seat} section...")
        
        # Process all lines looking for pilot data
        for line in lines:
            pilots = parse_pilot_line(line)
            for pilot in pilots:
                eqp = pilot['eqp']
                dom = pilot['dom']
                seat = pilot['seat']
                
                # Create nested structure if needed
                if eqp not in data:
                    data[eqp] = {}
                if dom not in data[eqp]:
                    data[eqp][dom] = {'CPT': [], 'FO': []}
                
                # Add pilot to appropriate list
                data[eqp][dom][seat].append(pilot)
    
    # Sort pilots by position within each group
    for eqp in data:
        for dom in data[eqp]:
            for seat in ['CPT', 'FO']:
                data[eqp][dom][seat].sort(key=lambda x: x['pos'])
    
    # RTF files don't extract date, return None
    return data, None


# ============================================================================
# OUTPUT GENERATION
# ============================================================================

def write_json_output(pilot_data, output_path, list_date=None):
    """
    Write pilot data to a JSON file.
    
    This JSON file can be fetched by the browser using AJAX/fetch requests.
    
    Args:
        pilot_data: The parsed pilot data dictionary
        output_path: Path where the JSON file should be written
        list_date: Optional date string (MM/DD/YY format) when the list was updated
    """
    print(f"Writing JSON to {output_path}")
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Add metadata if date is provided
    output_data = pilot_data
    if list_date:
        output_data = {
            '_metadata': {
                'list_date': list_date,
                'updated': list_date
            },
            **pilot_data
        }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    print(f"  JSON file created: {output_path}")


def write_js_output(pilot_data, output_path, list_date=None):
    """
    Write pilot data as a JavaScript file with a global variable.
    
    This allows the data to be loaded directly in the browser without CORS issues
    that can occur with fetch() on local file:// URLs.
    
    The data is assigned to GLOBAL_PILOT_DATA which the seniority-lookup.js
    script checks for as a fallback when fetch() fails.
    
    Args:
        pilot_data: The parsed pilot data dictionary
        output_path: Path where the JS file should be written
        list_date: Optional date string (MM/DD/YY format) when the list was updated
    """
    print(f"Writing JavaScript to {output_path}")
    
    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # Add metadata if date is provided
    output_data = pilot_data
    if list_date:
        output_data = {
            '_metadata': {
                'list_date': list_date,
                'updated': list_date
            },
            **pilot_data
        }
    
    # Format the JSON with indentation for readability
    json_string = json.dumps(output_data, indent=2, ensure_ascii=False)
    
    # Write as a JavaScript variable assignment
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"const GLOBAL_PILOT_DATA = \n{json_string};\n")
    
    # Also write the date as a separate constant for easy access
    if list_date:
        with open(output_path, 'a', encoding='utf-8') as f:
            f.write(f"\n// List updated date: {list_date}\n")
            f.write(f"const PILOT_LIST_DATE = '{list_date}';\n")
    
    print(f"  JavaScript file created: {output_path}")


def print_statistics(pilot_data):
    """
    Print a summary of the parsed pilot data.
    
    Shows counts for each equipment/domicile/seat combination and totals.
    """
    print("\n" + "=" * 50)
    print("PARSING STATISTICS")
    print("=" * 50)
    
    total_pilots = 0
    
    # Sort equipment types for consistent output (74Y first, then M1F, then others)
    equipment_order = ['74Y', 'M1F']
    sorted_equipment = sorted(pilot_data.keys(), 
                              key=lambda x: (equipment_order.index(x) if x in equipment_order else 999, x))
    
    for eqp in sorted_equipment:
        print(f"\n{eqp}:")
        
        # Sort domiciles alphabetically
        for dom in sorted(pilot_data[eqp].keys()):
            for seat in ['CPT', 'FO']:
                count = len(pilot_data[eqp][dom][seat])
                if count > 0:
                    total_pilots += count
                    print(f"  {dom} {seat}: {count} pilots")
    
    print("\n" + "-" * 50)
    print(f"TOTAL PILOTS: {total_pilots}")
    print("=" * 50)


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

def main():
    """
    Main function - determines input file type and processes accordingly.
    
    Checks for PDF first (preferred), then falls back to RTF if PDF not found.
    Generates both JSON and JavaScript output files.
    """
    print("\n" + "=" * 60)
    print("PILOT SENIORITY DATA PARSER")
    print("=" * 60)
    
    # Determine which input file to use
    input_file = None
    file_type = None
    
    # Check for PDF file first (preferred)
    if INPUT_FILE.exists():
        input_file = INPUT_FILE
        file_type = 'pdf'
        print(f"\nFound PDF input: {INPUT_FILE.name}")
    # Fall back to legacy RTF if PDF not found
    elif LEGACY_RTF_FILE.exists():
        input_file = LEGACY_RTF_FILE
        file_type = 'rtf'
        print(f"\nPDF not found, using legacy RTF: {LEGACY_RTF_FILE.name}")
    else:
        print(f"\nERROR: No input file found!")
        print(f"  Expected PDF: {INPUT_FILE}")
        print(f"  Or legacy RTF: {LEGACY_RTF_FILE}")
        return 1
    
    # Parse the input file based on its type
    list_date = None
    try:
        if file_type == 'pdf':
            pilot_data, list_date = parse_pdf_file(input_file)
        else:
            pilot_data, list_date = parse_rtf_file(input_file)
            # RTF files don't extract date, so list_date will be None
    except Exception as e:
        print(f"\nERROR parsing {file_type.upper()} file: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Validate we got some data
    if not pilot_data:
        print("\nERROR: No pilot data extracted from file!")
        print("The file may be in an unexpected format.")
        return 1
    
    # Generate output files
    write_json_output(pilot_data, OUTPUT_JSON, list_date)
    write_js_output(pilot_data, OUTPUT_JS, list_date)
    
    # Print summary statistics
    print_statistics(pilot_data)
    
    print("\n✅ Successfully generated pilot data files!")
    print(f"   - {OUTPUT_JSON}")
    print(f"   - {OUTPUT_JS}")
    
    return 0


if __name__ == '__main__':
    sys.exit(main())

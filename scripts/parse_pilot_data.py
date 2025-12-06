#!/usr/bin/env python3
"""
Parse RTF pilot data file and convert to JSON format.

This script reads the RTF file containing pilot seniority data and converts it
to a structured JSON format organized by Equipment Type → Domicile → Seat (CPT/FO).

Usage:
    python scripts/parse_pilot_data.py

Input: All pilots 1252025.rtf (in project root)
Output: assets/data/pilot-data.json
"""

import re
import json
import os
from pathlib import Path

# Get the project root directory (parent of scripts directory)
PROJECT_ROOT = Path(__file__).parent.parent
RTF_FILE = PROJECT_ROOT / "All pilots 1252025.rtf"
OUTPUT_FILE = PROJECT_ROOT / "assets" / "data" / "pilot-data.json"


def strip_rtf_formatting(text):
    """
    Remove RTF formatting codes from text.
    This is a simple approach - RTF files have control codes that we need to remove.
    """
    # Remove RTF control words (like \rtf1, \ansi, etc.)
    text = re.sub(r'\\[a-z]+\d*\s?', '', text)
    # Remove RTF control symbols (like \{, \}, etc.)
    text = re.sub(r'\\[^a-z]', '', text)
    # Remove braces
    text = text.replace('{', '').replace('}', '')
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def parse_pilot_line(line):
    """
    Parse a single pilot data line.
    
    Format: Position, Seniority#, Name, ID#, Dom, Eqp, Seat, Award
    Each line contains TWO pilots (left and right columns)
    
    Example: "            1     4   WILLIAMS, MICHAEL           0554460 ANC  74Y CPT    323                39   415   CRYAN, JOHN                 0557023 ANC  74Y CPT    322"
    
    Returns: list of dicts (can be 0, 1, or 2 pilots)
    """
    pilots = []
    
    # Skip empty lines or header lines
    if not line.strip() or 'Pos' in line or 'Sen#' in line or '---' in line:
        return pilots
    
    # Skip page headers
    if 'Schedule Bid Awards' in line or 'Page' in line or 'Bid Period' in line:
        return pilots
    
    # Pattern to match pilot data - matches one pilot entry
    # Format: whitespace, position (number), whitespace, seniority (number), whitespace, name, ID#, Dom, Eqp, Seat, Award
    pattern = r'\s+(\d+)\s+(\d+)\s+([A-Z\s\.,\'\-]+?)\s+(\d{7})\s+([A-Z0-9]+)\s+([A-Z0-9]+)\s+(CPT|F/O)\s+(\d+|\*)'
    
    # Find all matches in the line (can be 1 or 2 pilots)
    matches = re.finditer(pattern, line)
    
    for match in matches:
        pos = int(match.group(1))
        sen = int(match.group(2))
        name = match.group(3).strip()
        pilot_id = match.group(4)
        dom = match.group(5)
        eqp = match.group(6)
        seat = match.group(7)
        award = match.group(8)
        
        # Normalize seat: F/O -> FO
        if seat == 'F/O':
            seat = 'FO'
        
        pilots.append({
            'pos': pos,
            'sen': sen,
            'name': name,
            'id': pilot_id,
            'dom': dom,
            'eqp': eqp,
            'seat': seat,
            'award': award
        })
    
    return pilots


def parse_rtf_file(file_path):
    """
    Parse the RTF file and extract all pilot data.
    
    Returns: dict organized as {eqp: {dom: {seat: [pilots]}}}
    """
    print(f"Reading RTF file: {file_path}")
    
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Remove RTF formatting (simplified approach)
    # We'll work with the raw content and use regex to extract data
    
    # Initialize data structure
    data = {}
    current_seat = None
    
    # Split by "Seat:" markers to find sections
    sections = re.split(r'Seat:\s*', content, flags=re.IGNORECASE)
    
    print(f"Found {len(sections)} sections")
    
    for section in sections:
        if not section.strip():
            continue
        
        # Check if this section starts with CPT or F/O
        lines = section.split('\n')
        seat_type = None
        
        for line in lines[:5]:  # Check first few lines for seat type
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
        
        # Process all lines in this section
        for line in lines:
            pilots = parse_pilot_line(line)
            if pilots:  # Check if list is not empty
                for pilot in pilots:
                    eqp = pilot['eqp']
                    dom = pilot['dom']
                    seat = pilot['seat']
                    
                    # Initialize nested structure if needed
                    if eqp not in data:
                        data[eqp] = {}
                    if dom not in data[eqp]:
                        data[eqp][dom] = {'CPT': [], 'FO': []}
                    
                    # Add pilot to appropriate list
                    data[eqp][dom][seat].append(pilot)
    
    # Sort pilots by position within each equipment/domicile/seat combination
    for eqp in data:
        for dom in data[eqp]:
            for seat in ['CPT', 'FO']:
                data[eqp][dom][seat].sort(key=lambda x: x['pos'])
    
    return data


def main():
    """Main function to parse RTF and generate JSON."""
    # Check if input file exists
    if not RTF_FILE.exists():
        print(f"Error: RTF file not found at {RTF_FILE}")
        return 1
    
    # Parse the RTF file
    try:
        pilot_data = parse_rtf_file(RTF_FILE)
    except Exception as e:
        print(f"Error parsing RTF file: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    # Create output directory if it doesn't exist
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    # Write JSON output
    print(f"Writing JSON to {OUTPUT_FILE}")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(pilot_data, f, indent=2, ensure_ascii=False)
    
    # Print statistics
    total_pilots = 0
    for eqp in pilot_data:
        for dom in pilot_data[eqp]:
            for seat in ['CPT', 'FO']:
                count = len(pilot_data[eqp][dom][seat])
                total_pilots += count
                if count > 0:
                    print(f"  {eqp} {dom} {seat}: {count} pilots")
    
    print(f"\nTotal pilots processed: {total_pilots}")
    print(f"JSON file created successfully: {OUTPUT_FILE}")
    
    return 0


if __name__ == '__main__':
    exit(main())

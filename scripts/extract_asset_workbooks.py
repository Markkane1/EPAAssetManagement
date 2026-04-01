import argparse
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def normalize_whitespace(value):
    if value is None:
        return ""
    return " ".join(str(value).replace("\r", " ").replace("\n", " ").split()).strip()


def load_shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    values = []
    for item in root.findall("main:si", NS):
        text = "".join(node.text or "" for node in item.findall(".//main:t", NS))
        values.append(text)
    return values


def column_letters(reference):
    match = re.match(r"([A-Z]+)", reference or "")
    return match.group(1) if match else ""


def read_sheet_rows(path):
    with zipfile.ZipFile(path) as zf:
        shared_strings = load_shared_strings(zf)
        root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        rows = []
        for row in root.findall("main:sheetData/main:row", NS):
            record = {}
            for cell in row.findall("main:c", NS):
                ref = cell.attrib.get("r", "")
                column = column_letters(ref)
                cell_type = cell.attrib.get("t")
                value = ""
                if cell_type == "s":
                    node = cell.find("main:v", NS)
                    if node is not None and node.text is not None:
                        value = shared_strings[int(node.text)]
                elif cell_type == "inlineStr":
                    node = cell.find("main:is/main:t", NS)
                    value = node.text if node is not None and node.text is not None else ""
                else:
                    node = cell.find("main:v", NS)
                    value = node.text if node is not None and node.text is not None else ""
                record[column] = value
            rows.append(record)
        return rows


def workbook_to_rows(path):
    rows = read_sheet_rows(path)
    if not rows:
        return []
    header_row = rows[0]
    headers = {column: normalize_whitespace(value) for column, value in header_row.items()}
    data_rows = []
    for row_number, row in enumerate(rows[1:], start=2):
        data = {}
        for column, header in headers.items():
            if not header:
                continue
            data[header] = normalize_whitespace(row.get(column, ""))
        data_rows.append(
            {
                "sourceFile": path.name,
                "rowNumber": row_number,
                "data": data,
            }
        )
    return data_rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("files", nargs="+")
    args = parser.parse_args()

    payload = {"rows": []}
    for raw_file in args.files:
        path = Path(raw_file)
        payload["rows"].extend(workbook_to_rows(path))

    print(json.dumps(payload, ensure_ascii=True))


if __name__ == "__main__":
    main()

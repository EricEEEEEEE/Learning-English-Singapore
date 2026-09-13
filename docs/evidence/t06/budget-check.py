"""Validate proposal arithmetic only; performs no network or paid actions."""
from decimal import Decimal as D
from pathlib import Path
import csv
import json
import math

root = Path(__file__).resolve().parents[3]
rows = list(csv.DictReader((root / 'docs/experiments/b1/budget.csv').open()))
runway_seconds = 30 * 2 * math.ceil((10 + 60) / 6) * 6 + 10 * 2 * math.ceil((300 + 60) / 6) * 6
runway_once = D(runway_seconds) / 6 * D('.02') + 80 * D('.02')
x2 = 30 * (D(400) * D('.60') + 2000 * D(12)) / 1000000 * 2 + D('21.12')
x3 = D('15.9984') + runway_once * 2 + 594
x4 = D(48) + D('63.9936') + D('299.52') + D('281.60')
assert runway_seconds == 11520 and runway_once == 40
assert x2 == D('22.5744') and x3 == D('689.9984') and x4 == D('693.1136')
assert x4 - D('281.60') + 2376 == D('2787.5136')
for row in rows:
    assert row['approved_cap_usd'] == row['actual_cost_usd'] == '0'
    if row['experiment'] == 'X3' and row['supplier_endpoint'].startswith('Runway'):
        assert D(row['cost_high_usd']) == runway_once * 2
result = {
    'x2_max': str(x2), 'x3_runway_billed_role_seconds': runway_seconds,
    'x3_runway_once': str(runway_once), 'x3_known_max': str(x3),
    'x4_runway_max': str(x4), 'x4_ltx_max': '2787.5136',
    'image_max': '63.70', 'infra_pool': '128.50',
    'proposed_runway_total': 25 + 900 + 1000 + 75 + 150,
    'approved_usd': 0, 'actual_usd': 0, 'unknown_costs_not_zero': True,
    'rows': len(rows), 'result': 'pass',
}
(root / 'docs/evidence/t06/budget-arithmetic.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))

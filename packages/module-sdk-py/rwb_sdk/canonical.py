import json
import math
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any


def round_half_even(value: float, significant_digits: int = 10) -> float:
    """Round-half-even (banker's rounding) to the given number of significant digits.
    Matches JS roundHalfEven() and R's signif(..., digits=10) semantics."""
    if value == 0:
        return 0.0
    d = Decimal(repr(value))
    rounded = float(d.quantize(
        Decimal(10) ** (int(d.adjusted()) - significant_digits + 1),
        rounding=ROUND_HALF_EVEN,
    ))
    return rounded


class _CanonicalEncoder(json.JSONEncoder):
    def default(self, o: Any) -> Any:
        return super().default(o)

    def encode(self, o: Any) -> str:
        return super().encode(_normalize(o))


def _normalize(value: Any) -> Any:
    if isinstance(value, float) and math.isfinite(value):
        return round_half_even(value, 10)
    if isinstance(value, dict):
        return {k: _normalize(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    return value


def write_json(path: str, value: Any) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True, cls=_CanonicalEncoder)
        handle.write("\n")

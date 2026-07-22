#!/usr/bin/env python3
"""Validate portable asset paths and local USD composition dependencies."""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional


USD_REFERENCE = re.compile(r"@([^@\n]+)@")


@dataclass
class ValidationResult:
    resolved: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return not self.errors

    def as_dict(self) -> dict[str, object]:
        return {
            "valid": self.valid,
            "resolved": sorted(set(self.resolved)),
            "warnings": self.warnings,
            "errors": self.errors,
        }


def _inside(root: Path, candidate: Path) -> bool:
    try:
        return os.path.commonpath((str(root), str(candidate))) == str(root)
    except ValueError:
        return False


def is_safe_relative_asset_path(value: object) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    path = Path(value)
    return (
        not path.is_absolute()
        and "\\" not in value
        and ".." not in path.parts
        and value == value.strip()
    )


def iter_mappings(manifest: dict[str, object]) -> Iterable[tuple[str, dict[str, object]]]:
    for section in ("defaults", "overrides"):
        record = manifest.get(section, {})
        if not isinstance(record, dict):
            continue
        for name, mapping in record.items():
            if isinstance(mapping, dict):
                yield f"{section}.{name}", mapping


def _validate_usd_dependencies(
    file_path: Path,
    asset_root: Path,
    result: ValidationResult,
    visited: set[Path],
) -> None:
    resolved_file = file_path.resolve()
    if resolved_file in visited:
        return
    visited.add(resolved_file)

    if resolved_file.suffix.lower() not in {".usd", ".usda", ".usdc"}:
        return
    try:
        payload = resolved_file.read_bytes()
    except OSError as exc:
        result.errors.append(f"cannot read {resolved_file}: {exc}")
        return

    if payload.startswith(b"PXR-USDC"):
        result.warnings.append(
            f"{resolved_file.relative_to(asset_root)} is binary USDC; dependency scanning requires usdchecker"
        )
        return

    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        result.warnings.append(
            f"{resolved_file.relative_to(asset_root)} is not UTF-8 USDA; dependency scanning skipped"
        )
        return

    for authored_ref in USD_REFERENCE.findall(text):
        # Package/remote identifiers are valid USD dependencies but are not
        # repository files that this portable manifest can resolve.
        if "://" in authored_ref or "[" in authored_ref:
            result.warnings.append(
                f"{resolved_file.relative_to(asset_root)} uses external dependency {authored_ref}"
            )
            continue
        dependency = (resolved_file.parent / authored_ref).resolve()
        label = f"{resolved_file.relative_to(asset_root)} -> {authored_ref}"
        if not _inside(asset_root, dependency):
            result.errors.append(f"{label}: dependency escapes the asset root")
        elif not dependency.is_file():
            result.errors.append(f"{label}: dependency is missing")
        else:
            result.resolved.append(str(dependency.relative_to(asset_root)))
            _validate_usd_dependencies(dependency, asset_root, result, visited)


def validate_manifest(manifest_path: Path, asset_root: Optional[Path] = None) -> ValidationResult:
    manifest_path = manifest_path.resolve()
    asset_root = (asset_root or manifest_path.parent).resolve()
    result = ValidationResult()

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        result.errors.append(f"cannot load manifest {manifest_path}: {exc}")
        return result
    if not isinstance(manifest, dict):
        result.errors.append("manifest must be a JSON object")
        return result

    mappings = list(iter_mappings(manifest))
    if not mappings:
        result.errors.append("manifest has no asset mappings")
        return result

    visited: set[Path] = set()
    for label, mapping in mappings:
        for field_name in ("asset", "articulationAsset"):
            asset = mapping.get(field_name)
            if field_name != "asset" and asset is None:
                continue
            field_label = f"{label}.{field_name}"
            if not is_safe_relative_asset_path(asset):
                result.errors.append(
                    f"{field_label} is not a safe relative POSIX path: {asset!r}"
                )
                continue
            candidate = (asset_root / str(asset)).resolve()
            if not _inside(asset_root, candidate):
                result.errors.append(f"{field_label} escapes the asset root: {asset}")
            elif not candidate.is_file():
                result.errors.append(f"{field_label} is missing: {asset}")
            else:
                result.resolved.append(str(candidate.relative_to(asset_root)))
                _validate_usd_dependencies(candidate, asset_root, result, visited)

    return result


def parse_args() -> argparse.Namespace:
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=here / "asset-manifest.json")
    parser.add_argument("--asset-root", type=Path)
    parser.add_argument("--json", action="store_true", help="emit a machine-readable report")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = validate_manifest(args.manifest, args.asset_root)
    if args.json:
        print(json.dumps(result.as_dict(), indent=2))
    else:
        for path in sorted(set(result.resolved)):
            print(f"[resolved] {path}")
        for warning in result.warnings:
            print(f"[warning] {warning}")
        for error in result.errors:
            print(f"[error] {error}")
        print(
            f"Asset manifest {'valid' if result.valid else 'invalid'}: "
            f"{len(set(result.resolved))} files, {len(result.warnings)} warnings, {len(result.errors)} errors"
        )
    return 0 if result.valid else 1


if __name__ == "__main__":
    raise SystemExit(main())

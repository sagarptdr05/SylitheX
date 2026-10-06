from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Profile = Literal["crop_monitoring", "flood_detection", "urban_planning", "climate_monitoring"]


class TrustCheckRequest(BaseModel):
    scene_id: str = Field(..., examples=["DEMO-HEALTHY"])
    aoi: str = Field("nashik", examples=["nashik", "vasai-virar"])
    profile: Profile = "crop_monitoring"


class TrustCheckResponse(BaseModel):
    scene_id: str
    aoi: str = "nashik"
    trust_score: float
    trust_interval: list[float]
    ai_readiness: float
    profile: str
    status: Literal["PASS", "WARNING", "BLOCKED"]
    components: dict[str, Any]
    gate_rules_triggered: list[dict[str, str]]
    false_confidence: bool
    reasons: list[str]
    worst_tiles: list[dict[str, Any]]
    decision: str
    alert_sent: bool = False


class FaultRequest(BaseModel):
    aoi: str = "nashik"
    base_scene: str = "DEMO-HEALTHY"
    profile: Profile = "crop_monitoring"
    cloud_coverage: float = Field(0.0, ge=0, le=0.9)
    cloud_size: float = Field(0.5, ge=0, le=1)
    dropout: float = Field(0.0, ge=0, le=0.6)
    noise: float = Field(0.0, ge=0, le=1)
    miscalibration: float = Field(0.0, ge=-0.5, le=0.5)
    ndvi_spike: float = Field(0.0, ge=0, le=0.3)
    spike_value: float = 1.4
    sar_inconsistency: float = Field(0.0, ge=0, le=0.8)
    flood_event: float = Field(0.0, ge=0, le=0.3)
    duplicate: float = Field(0.0, ge=0, le=1)
    timestamp_shift: int = Field(0, ge=-30, le=30)
    seed: int = 42


class ReviewRequest(BaseModel):
    aoi: str = "nashik"
    scene_id: str
    decision: Literal["APPROVE", "REJECT", "REPROCESS"]
    reviewer: str = "analyst"
    note: str = ""


class WebhookConfig(BaseModel):
    url: str = ""


class WhatIfRequest(BaseModel):
    aoi: str = "nashik"
    scene_id: str
    weights: dict[str, float]


class AoiCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=60, examples=["Pune · Hadapsar"])
    lat: float = Field(..., ge=-60, le=75)
    lon: float = Field(..., ge=-180, le=180)
    region: str = ""
    description: str = ""
    size_km: float = Field(7.68, ge=3.84, le=11.52)

# TerraTrust AI: pitch outline and demo script

## 10-slide outline

1. **Title.** TerraTrust AI: "Before AI trusts Earth, TerraTrust verifies it." Show the hero orbital view: a 3D Earth with Sentinel-1/2 passing over Nashik.
2. **Problem (ST-03).** EO models consume whatever pixels arrive. Over Maharashtra, 12 of 40 optical acquisitions in our year were monsoon-clouded. Clouds read as "crop damage", and shadows read as "flood".
3. **Real failures we measured.** A crop classifier on a real cloudy scene reaches 62.7 % accuracy, and flood mapping produces 1.63 km² of false water.
4. **The solution.** A trust layer between sensors and AI: Ingest → Clean → Recover → Validate → Score → Gate. PASS goes to the AI, WARNING to a human, BLOCKED is rejected.
5. **How the score works.** Eight components with configurable weights, nonlinear penalties, hard gate rules and a ± uncertainty interval. A separate AI readiness score per use case: the same cloudy scene gets 64 for crops and 80 for SAR-based flood detection.
6. **What makes it smart.**
   - Physics-informed S1↔S2 agreement, learned on the AOI.
   - Real-event logic: a flood confirmed by S1 is not penalised.
   - A False Confidence Detector for scenes that look clean but aren't.
   - Pseudo-invariant calibration checks.
   - Every reconstructed pixel is labelled, with its uncertainty.
7. **Proof without ground truth.** The Synthetic Corruption Benchmark gives monotonic response curves and Spearman ρ = −0.77 over 260 scenes. XGBoost + SHAP reaches R² 0.89, and it is used as evidence, never as the decision.
8. **Downstream impact.** Crop accuracy rises from 62.7 % to 77.9 %, false flood area drops from 1.63 to 0.03 km², and the corrupted scene is BLOCKED (11 km² of wrong predictions avoided).
9. **Product.**
   - Trust Gate API (one POST before inference) with webhook on BLOCKED.
   - Trust Passport (JSON/CSV with checksum).
   - Human review queue.
   - Trust Timeline with a monsoon forecast.
10. **Roadmap and ask.**
    - U-Net reconstruction and autoencoder anomalies.
    - Thermal and weather sensors.
    - ISRO Bhuvan / EOS-04, federated trust.
    - Pilot with a state agriculture or disaster-management department.

## 3-minute demo script

| Time | Screen | Say / do |
|---|---|---|
| 0:00 | Landing | "Can AI trust this satellite data?" Point at the orbital view: Sentinel-1 and Sentinel-2 passing over our Nashik AOI. Scroll to **Problem**: real cloud → wrong crop estimate, shadow → false flood. |
| 0:30 | Dashboard | 45 scenes verified: 21 passed, 10 warning, 14 blocked before any AI saw them. The timeline shows the monsoon dip. |
| 0:45 | Scene Analysis · DEMO-HEALTHY | Trust 94 ± 2 → **PASS**. Turn on the Trust Map and open a tile: "Why should I trust this tile?" |
| 1:05 | Scene Analysis · DEMO-CLOUDY | Real monsoon scene. Show the cloud mask, then drag the before/after slider: red = RECONSTRUCTED. 62 → **WARNING**. Change the use case to Flood Detection: readiness jumps to 80 because SAR sees through clouds. |
| 1:35 | Corruption Lab | Start from clean (94 PASS). Drag noise and stripe dropout: the score falls live to WARNING, then click "Sensor failure" → **BLOCKED**. The packet stops at the gate: "This data has been blocked from reaching the downstream AI model." Then click "Real flood": 85, PASS, with tiles confirmed by S1, because a real event is not an error. |
| 2:15 | Explainability · DEMO-FALSECONF | **False Confidence** banner: the scene looks perfect but NIR is miscalibrated. Show the waterfall, the SHAP factors and the validation curve. |
| 2:35 | API Console | Send `POST /api/trust/check` on DEMO-SUSPICIOUS → BLOCKED, "Alert sent". |
| 2:45 | Passport | Export the JSON certificate with its checksum. |
| 2:55 | Roadmap | One line on U-Net, thermal/weather and ISRO Bhuvan. Close: "Before AI trusts Earth, TerraTrust verifies it." |

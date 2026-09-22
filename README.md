# RoadAnchOR

**Road-Adaptive Query Anchoring for End-to-End Autonomous Driving**

[Project Page](https://qqqwwweee213313.github.io/RoadAnchOR-Project/) · [Code Repository](https://github.com/qqqwwweee213313/RoadAnchOR)

The page contains the manuscript title, supplied RoadAnchOR illustration, abstract, a captioned algorithm introduction video, Figure 2 architecture, Figure 4 multimodal trajectory visualization from RAS to ARA, and a scenario-based gallery for RoadAnchOR qualitative videos. The approximately 2:34 algorithm video appears after the abstract, with native playback controls and a [Download MP4](https://github.com/qqqwwweee213313/RoadAnchOR-Project/releases/download/video-2026-09-22-v5/RoadAnchOR_Narrated_EN_1080p.mp4) button. It contrasts fixed anchors with schematic road-adaptive initialization on a two-lane road and an intersection, including candidates that reach the adjacent lane. Red straight-ahead candidates are collinear and differ only in length. It includes the complete Parked Obstacle and Vehicle Opens Door Two Ways source clips at their original speed. It uses English captions with AI English narration from Kokoro-82M v1.0 (af_heart). Narration condenses the captions while preserving the original video. [Spoken transcript](static/data/overview-narration.en.txt) · [Original silent MP4](https://github.com/qqqwwweee213313/RoadAnchOR-Project/releases/download/video-2026-09-21-v4/RoadAnchOR_Explainer_EN_1080p.mp4). Figure 4 appears immediately before the scenario gallery.

## Edit the page

- `index.html`: title, abstract, anonymous author label, and sharing metadata.
- `static/css/index.css`: responsive layout and styling.
- `static/images/roadanchor.png`: supplied 1536 × 1024 illustration, preserved at its original resolution.
- `static/images/roadanchor-architecture-figure2.png`: high-resolution rendering of manuscript Figure 2.
- `static/images/roadanchor-ras-ara-figure4.png`: rendering of the supplied Figure 4 showing multimodal trajectory candidates and the final predicted ego trajectory in straight-road and intersection scenarios.
- `static/videos/roadanchor-algorithm-overview.mp4`: 1080p/30 fps, 153.733333-second algorithm introduction with English captions and AI narration (4,612 unchanged video frames).
- `static/images/roadanchor-algorithm-overview-poster.png`: poster taken from the introduction video.
- `static/data/scenarios.json`: generated scenario and video catalog.
- `static/js/qualitative.mjs`: native video players in the scenario gallery.
- `scripts/import-videos.mjs`: imports videos from a separate local source folder.
- `.nojekyll`: enables direct serving of static files on GitHub Pages.

No package installation or build step is required. GitHub Pages publishes the root of the `master` branch. After updating the title, also update the page title and sharing metadata. This project uses RoadAnchOR standalone videos only. See [VIDEO_GUIDE.md](VIDEO_GUIDE.md) for folder conventions, importing, and publishing.

The page requests `noindex, nofollow` during anonymous review. This is a search-engine preference, not access control: both the page and repository are public.

## Website credits

Adapted from [Academic Project Page Template](https://github.com/eliahuhorwitz/Academic-project-page-template), based on [Nerfies](https://nerfies.github.io/). The website template is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The supplied research text and illustration retain their respective rights.

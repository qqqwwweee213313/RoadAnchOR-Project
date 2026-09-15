# Adding RoadAnchOR qualitative videos

Only RoadAnchOR standalone videos are shown.

## Folder layout

Place videos into a local source folder separate from this website checkout:

```text
videos/
  01_unprotected_left_turn/
    approach.mp4
    approach.jpg
    turn.mp4
    scenario.json
  02_obstacle_avoidance/
    driving.mp4
  another_scenario.mp4
```

- A scenario folder groups its videos together; filenames are free to choose.
- A video placed directly in the source root becomes its own scenario.
- Folder and file names supply the default display titles. Numeric prefixes such as `01_` control natural ordering and are omitted from display titles.
- Names such as `roadanchor_r11715_EnterActorFlow.mp4` display as **Enter Actor Flow**, with the original `r11715` identifier shown on the video card.
- A same-basename `.jpg`, `.jpeg`, `.png`, or `.webp` is an optional poster.
- Empty folders and unrelated documents do not create video cards.
- Keep one scenario per folder. Nested folders are treated as separate scenarios.

## Optional titles and captions

A `scenario.json` inside a scenario folder can override the display text:

```json
{
  "title": "Unprotected left turn",
  "description": "Describe the scene and what the reader should observe.",
  "order": 1,
  "clips": {
    "approach.mp4": {
      "title": "Approaching the intersection",
      "caption": "An optional description of this video."
    }
  }
}
```

Metadata is optional. Only title, description, order, and the clip title/caption fields are used. Local source paths are not included in the generated catalog.

## Import and publish

From the website checkout, with Node.js installed:

```text
node scripts/import-videos.mjs --source "path/to/videos" --check
node scripts/import-videos.mjs --source "path/to/videos"
```

The first command validates without writing. The second copies media under `static/videos/scenarios/` and updates `static/data/scenarios.json`. It does not commit or publish. Review the page and commit those generated files with the anonymous account; pushing to `master` updates GitHub Pages.

Adding files to a local folder alone does not update the public site. Ask the assistant to import and publish the videos after adding them.

An empty source folder leaves the previous catalog unchanged. All inputs are validated before copying, and the catalog is replaced only after copying succeeds. Existing media files are preserved, including files no longer referenced by the newest catalog. There is no automatic deletion or transcoding.

## Video format and size

Use MP4 with H.264 video and, if audio is present, AAC audio for broad browser support. WebM is also accepted. Extension and container headers are checked, but actual codec playback must be checked with the supplied videos. MOV/AVI/MKV and other unsupported containers must be converted first.

Files over 100 MiB are rejected, and files over 50 MiB produce a warning. The importer checks the full checkout size against the Pages 1 GB site limit; 900 MB is an additional early-warning threshold. Git LFS is not a GitHub Pages video-hosting solution.

Sources: [GitHub file limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits), [Git LFS limitations](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-git-large-file-storage), [MDN video codecs](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Video_codecs).

## Page behavior

All scenarios appear under Qualitative Results in a two-column grid, with one column on mobile. Each scenario displays its videos directly. Native playback, seeking, volume, and fullscreen controls are available. Videos are muted initially and do not autoplay. Playing one pauses other videos. A direct Open video link is provided for each clip.

Figure 2 is displayed as a full-page, high-resolution PNG rendered from the manuscript figure. The supplied logo and published abstract remain unchanged.

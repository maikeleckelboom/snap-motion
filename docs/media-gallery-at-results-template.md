# Media gallery assistive-technology results template

> Prepared for manual assistive-technology certification

Copy this file for each human run. Do not edit the template into a cumulative claim. Suggested
filename:

```text
media-gallery-at-YYYY-MM-DD-platform-browser-at.md
```

Allowed result values are `Pass`, `Fail`, `Blocked`, and `Not run`. Automated evidence must never be
entered as a human `Pass`.

## Run identity

| Field                            | Value                        |
| -------------------------------- | ---------------------------- |
| Run ID                           |                              |
| Date and local time              |                              |
| Tester                           |                              |
| Regular screen-reader user?      | Yes / No / Prefer not to say |
| Physical device or VM            |                              |
| Device model                     |                              |
| OS and build                     |                              |
| Browser and version              |                              |
| Browser channel                  |                              |
| Assistive technology and version |                              |
| Speech language and voice        |                              |
| Input hardware                   |                              |
| Orientation                      |                              |
| Browser zoom                     |                              |
| Text/font size                   |                              |
| Display scaling/zoom             |                              |
| Motion setting                   | Full / Reduced / System      |
| Harness commit or branch         |                              |
| Harness URL                      |                              |

## Run disposition

| Field               | Value                           |
| ------------------- | ------------------------------- |
| Matrix row          |                                 |
| Overall result      | Pass / Fail / Blocked / Not run |
| Started             |                                 |
| Completed           |                                 |
| Issue links         |                                 |
| Retest of run/issue |                                 |
| Retest date         |                                 |
| Reviewer            |                                 |

Overall `Pass` requires every applicable required contract below to pass. A failed or blocked
required contract makes the row `Fail` or `Blocked`; explain any accepted platform limitation.

## Setup record

- AT enabled before page load:
- Browser/AT mode at start:
- Quick Nav, browse/focus mode, or reading-control configuration:
- Safari keyboard-focus setting, if applicable:
- Harness heading found:
- Exact visible preparation status:
- Deviations from the dossier:

## Shared contract results

| ID  | Result  | Scenario and action | Exact observed output or behavior | Issue |
| --- | ------- | ------------------- | --------------------------------- | ----- |
| C01 | Not run |                     |                                   |       |
| C02 | Not run |                     |                                   |       |
| C03 | Not run |                     |                                   |       |
| C04 | Not run |                     |                                   |       |
| C05 | Not run |                     |                                   |       |
| C06 | Not run |                     |                                   |       |
| C07 | Not run |                     |                                   |       |
| C08 | Not run |                     |                                   |       |
| C09 | Not run |                     |                                   |       |
| C10 | Not run |                     |                                   |       |

## Scenario results

### Baseline, three items

| Step                           | Input/command | Expected contract | Result  | Exact speech, timing, focus, and trace notes |
| ------------------------------ | ------------- | ----------------- | ------- | -------------------------------------------- |
| Open                           |               | C01, C02          | Not run |                                              |
| Next                           |               | C04-C06           | Not run |                                              |
| Previous                       |               | C04-C06           | Not run |                                              |
| Home/End or mobile equivalents |               | C05, C06          | Not run |                                              |
| Complete forward traversal     |               | C03-C07           | Not run |                                              |
| Complete reverse traversal     |               | C03-C07           | Not run |                                              |
| Zoom in/out/Fit                |               | C07               | Not run |                                              |
| Navigate while zoomed          |               | C07               | Not run |                                              |
| Close button                   |               | C10               | Not run |                                              |
| Escape, if available           |               | C10               | Not run |                                              |
| Reduced-motion repeat          |               | C06               | Not run |                                              |

### Single-item boundary

| Step                    | Result  | Exact speech, state, and order | Issue |
| ----------------------- | ------- | ------------------------------ | ----- |
| Open and identify image | Not run |                                |       |
| Previous boundary       | Not run |                                |       |
| Next boundary           | Not run |                                |       |
| Modal traversal         | Not run |                                |       |
| Close and focus return  | Not run |                                |       |

### Full-image failure

| Step                            | Result  | Exact speech, state, and operability | Issue |
| ------------------------------- | ------- | ------------------------------------ | ----- |
| Failure becomes available       | Not run |                                      |       |
| Preview retains accessible name | Not run |                                      |       |
| Retry is named and operable     | Not run |                                      |       |
| Close remains operable          | Not run |                                      |       |

### Preview failure

| Step                              | Result  | Exact speech, state, and operability | Issue |
| --------------------------------- | ------- | ------------------------------------ | ----- |
| Preview failure becomes available | Not run |                                      |       |
| No full-image Retry is exposed    | Not run |                                      |       |
| Close remains operable            | Not run |                                      |       |

## Event trace comparison

Paste or transcribe the non-live trace only after completing the spoken-interaction notes.

```text

```

| Check                                                        | Result  | Notes |
| ------------------------------------------------------------ | ------- | ----- |
| `opened` follows the open request                            | Not run |       |
| Each committed navigation has one `indexChanged`             | Not run |       |
| Spoken item output corresponds to the committed index        | Not run |       |
| Close order is `requestClose`, `update:open false`, `closed` | Not run |       |
| Trace itself was not announced as a live update              | Not run |       |

## Defects and limitations

For each defect, include reproduction steps, exact output, expected result, frequency, scenario ID,
contract ID, screenshots/video only where useful, event trace, and issue link.

### Defect 1

- Contract:
- Scenario:
- Reproduction:
- Exact observed output:
- Expected:
- Frequency:
- Issue:

## Tester conclusion

- Overall result and rationale:
- Accepted platform limitations:
- Required follow-up:
- Signature/name:
- Date:

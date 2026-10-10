List of observations, notes, TODOs and revisions, in no particular order.

- Make sidebar collapsible
- Can we test HTTP streaming and decouple the Jev call from the OpenAI call? The difference in latency is very big as seen in the examples. The simple generative call to generate the title takes about 10-20x more than Jev. It'd be cool if Jev answered fast (perhaps via HTTP streaming, not sure), whatever sort of information it has already settled in, enriching the skeleton in a selleable/productized way that they might appreciate the usage.
- Mabye: Test out OpenAI decisions API as another judge provider such that they can deploy it without TypeSafe and only using OpenAI key
- Reason (and maybe fix) about in-code "TODO" items
- Add that graph that has bubbles spread accross 2-axis and the bigger they are they represent an unit
- Verify whether it's system1 or system0 model and updata README accordingly
- Update examples, code and README response example so that they never have bullet points or em-dashes in the middle of the text. E.g.:      "subtitle": "3,775 trials on ClinicalTrials.gov · based on the 3,000 most recently started · counted once per phase · 531 trials without a phase not shown · data as of 2026-10-09". We can have a way better separation using plain commas, I believe.
- I've made significant changes to README.md, and I'd like to keep them that way. Short, nice, with only the signal and no noise.
- Deploy to Fly.io
- Change Jev and OpenAI mentions in README.md to the generic component they represent.
- What is a datum?
- I made so many changes to the readme, but it still sucks. there's a beauty in being concise and short, and to manage to breakdown complex data and systems into simple, short and explaninable decision. everywhere in how it decides, validation, ## design decisions and trade-offs, ## limitations and next steps, ai usage, are poor examples of this, where we clearly managed to be very wordy. realistically, do you really think someone is actually going to read the entiretiy of this fuckinkg gigatic hassle? nobody is. that's why we have to simplify even more, be a bit more generic (like what i said about jev and openai models vs. systemone and llm models, yada yada, as well as language improvements such that this is still as good as, but with 1/3 of the lenght.) Perhaps also add more visualizations throughout the README, with flowcharts and excalidraw images.
- Excalidraw is not good, also remove bullet points from it. it's also very high level. I wasn't sure to expect because you never get the depth of Excalidraws right, but this one lacks detail. Like the "Jev · 11 closed questions
intent · dimension · chart
granularity · metric · edge · flags
→ probabilities, ~200 ms", "Extraction · strict JSON
drugs, conditions, sponsors,
countries, years, limit
fast model, ~400 ms" and "Plan (code)
thresholds · arms
compatibility matrix → chart" are pretty much all black boxes, such that we have no external understanding whatsoever of WTF they do.

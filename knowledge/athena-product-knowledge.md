# Athena Product Knowledge

> **Purpose**
>
> This document is Athena's canonical product knowledge for the Help Center assistant.
> It teaches Athena how Athena V2 works today so answers stay accurate, practical, and consistent.
>
> It is written for conversational understanding rather than traditional documentation.

---

# Athena Overview

Athena is an intelligence OS that learns a business, then helps the user grow it.

Athena helps the user:

- Define the business
- Build visibility
- Generate traction
- Convert opportunities

Athena is not a generic chatbot and not a V1 market-conversation import tool.

The user teaches, corrects, and points Athena. Athena researches, analyzes, and generates in the background. The user reviews the result and guides the next step.

Home answers “What should I do right now?” from live workspace state.

The Help Center answers “What is Athena and how does it work?”

This assistant explains the product. It does not load the user's business data and does not change anything.

---

# Core Philosophy

Athena separates company knowledge, generated intelligence, and conversation.

Knowledge is what Athena Brain knows about the business after Train or Retrain.

Intelligence is Athena’s structured analysis of evidence on a Visibility analysis, Audience, Prospect, campaign, or social week.

Conversation explains that work. Conversation does not silently change it.

These layers stay separate so Athena remains predictable.

---

# Core Principles

## Athena Brain is foundational

Everything useful begins with Athena Brain on Identity.

The Brain teaches Athena:

- who the user is
- what the business does
- how the business communicates
- what expertise the business has
- what website evidence exists

Without a trained Brain, Athena can still open other modules, but the work is less informed.

## Identity edits do not update the Brain until Train or Retrain

There is no separate Identity save.

Changing Voice, Business Knowledge, or the website does not update Athena until the user chooses Train or Retrain.

A successful Identity Deep Scrape retrains Athena Brain automatically as part of that workflow. The user does not need a second manual Retrain after it completes.

Identity has no observation workflow.

## Audience and Prospect are different

An Audience is the segment or person the user wants to reach.

A Prospect is one specific business the user may pursue.

Do not treat them as the same object.

Older screens may say Persona. That means Audience.

## Intelligence is versioned

Refresh creates new intelligence from current evidence and preserves previous intelligence.

Try another approach asks for a different strategic interpretation of the same evidence.

Advertising uses Create another version instead, which starts a new campaign.

## Conversations are advisory

Discuss and Ask Athena explain.

They do not save, scrape, generate, or change the underlying object unless a surface explicitly offers Apply.

Social Planner’s Apply Athena's Suggestions is the documented exception. It creates a revised week and keeps the previous one.

## Long-running work is asynchronous

Generation can continue after the user leaves the page.

Queued and Processing mean Athena is still working.

Ready means the result can be used.

Failed means retry on that object when Retry exists.

A failed Social week is started again as a new week.

## Working status is not intelligence readiness

Working status is the user’s pipeline label.

Intelligence readiness is Athena’s generation state.

Changing working status does not generate intelligence.

---

# Four Business Outcomes

## 1. Define Your Business

Route: `/identity`

Module name: Athena Brain

The user teaches Voice, Business Knowledge, and the business website, then Trains or Retrains Athena.

Useful when the Brain is Ready and Athena can describe the business in the user’s language.

Secondary Identity tools:

- Brand Identity stores logo, colors, and font for later branded output
- AI Workspace remembers preferred continuation destinations
- GetOblic Links are optional utilities, not a growth step

## 2. Build Visibility

Routes: `/seo`, `/seo/new`

Athena analyzes whether people can discover and understand the offer.

Visibility Strategy is the first analysis.

Website Technical Health reviews on-page evidence for pages Athena already learned. It needs richer website intelligence. If that is missing, the user should open Define Your Business, add the website and Retrain, or run Identity Deep Scrape (which retrains Athena Brain automatically), then return.

Scores are not live Google ranking, traffic, or Search Console scores.

## 3. Generate Traction

Routes: `/personas`, `/ads`, `/social-planner`

The user reaches the right people with Audiences, advertising, and social content.

Athena uses Athena Brain plus a selected Audience when one is chosen.

Without a selected Audience, Athena still uses the Brain and saved audiences.

## 4. Convert Opportunities

Routes: `/prospects`, `/prospects/find`

The user pursues specific businesses.

Find opportunities is the primary path: GetOblic Directory or Google.

Users can also add a business themselves.

Directory holds consume GetOblic listing capacity. Releasing a listing frees capacity. The Prospect and Athena research can remain.

---

# Quick Start

The current first path is:

1. Teach and Train Athena Brain
2. Run a Visibility Strategy analysis
3. Define the first Audience
4. Add or find the first Prospect

Do not tell a new user to start in Inbox, Discussions, Opportunities, or Briefings.

---

# Product Vocabulary

## Athena

The complete Athena V2 workspace.

## Athena Brain / Business Brain

Trusted company context on Identity.

## Voice

How the business communicates.

## Business Knowledge

What the business knows: methods, offers, terminology, and rules.

## Website intelligence

What Athena learns from websites.

On Identity, this is the user’s own site.

On an Audience, a reference website is optional research about the segment, not assumed to be that person’s own site.

On a Prospect, the website is that business’s own site.

## Deep Scrape / Research this website

Broader website learning the user starts when needed.

Identity Deep Scrape needs a Ready Brain and a website. It researches additional website pages and retrains Athena Brain automatically. The user does not need a second manual Retrain after successful completion.

Audience and Prospect research participate in follow-on intelligence.

Prospects without a website cannot generate useful intelligence until a site is added.

## Audience

The segment or person the user wants to reach.

## Prospect

One specific business the user may pursue.

## Intelligence

Athena’s structured analysis of current evidence. Versioned.

## Observation

A real-world note the user adds.

Audience: appends to notes and queues new intelligence.

Prospect: add and refresh.

Identity: not available.

## Refresh intelligence

New analysis from current evidence. Previous intelligence is preserved.

Audience profile save does not itself regenerate intelligence.

Meaningful Prospect edits may queue a refresh.

## Try another approach

A different strategic reading of the same evidence.

Supported on Audience, Prospect, and Social Planner.

Ads uses Create another version.

## Discuss / Ask Athena

Read-only explanation.

Exception: Social Planner Apply Athena's Suggestions.

## Ready / Failed / Retry

Generation states.

Retry the failed object when that action exists.

## Working status

User pipeline state such as New, Reviewing, In Use, Follow-up, Not a Fit, or Completed.

## Saved work

- Athena Brain: `/identity`
- Visibility analyses: `/seo`
- Audiences: `/personas`
- Campaigns: `/ads`
- Social weeks: `/social-planner`
- Prospects: `/prospects`

## GetOblic listing capacity

A Convert/Home constraint. Directory adds can consume a hold. Release returns capacity.

---

# Important Distinctions

- Identity edits do not update the Brain until Train or Retrain.
- Identity has no observation workflow.
- Identity Deep Scrape retrains Athena Brain automatically. Do not instruct a second manual Retrain after successful completion.
- Audience = who to reach.
- Prospect = which business to pursue.
- Observation adds real-world evidence.
- Refresh creates new intelligence and preserves previous intelligence.
- Try another approach creates a different strategic interpretation.
- Discuss/Ask is read-only unless a surface explicitly offers Apply.
- Social Planner Apply Athena's Suggestions is the exception.
- Ads uses Create another version rather than Try another approach.
- Background generation can continue after the user leaves the page.
- Completeness and Opportunity Score are not a ranking of who to pursue.
- Create Audience from Prospect needs Ready Prospect intelligence.

---

# How do I...?

## I just joined

Teach and Train Athena Brain. Run Visibility Strategy. Create or suggest an Audience. Find or add a Prospect.

## Teach Athena about the business

Open Identity. Write Voice, Business Knowledge, and website. Train Athena. Review what Athena knows.

## Improve what Athena knows

Update the teachable facts. Retrain. Optionally Deep Scrape the website. Deep Scrape retrains Athena Brain automatically, so do not Retrain again after it succeeds.

## Understand visibility

Open Build Visibility. Start Visibility Strategy. Return when Ready. Use Technical Health only after richer website learning.

## Create an Audience

Open `/personas/import`. Create manually, import CSV, or suggest from Athena Brain.

## Suggest an Audience

Train the Brain first. Open Create Audience. Choose Suggest an audience. Review before creating.

## Create an Audience from a Prospect

Open a Prospect with Ready intelligence. Use Create Audience from Prospect.

## Generate social content for one Audience

Open the Audience or Social Content. Select the Audience and a week start date. Generate the week.

## Generate advertising for one Audience

Open the Audience or Advertising. Create a campaign with that Audience selected.

## Generate ads or social without selecting an Audience

Athena still uses Athena Brain and saved audiences. The work is saved in Advertising or Social Content.

## Find or import a Prospect

Use `/prospects/find` first. Add a business yourself when the details are already known.

## Research a Prospect

Add their website. Run Research this website if needed. Wait for Ready intelligence.

## Move a Prospect forward

Read the recommendation and outreach drafts. Update working status. Add observations and refresh when facts change.

## Improve incomplete intelligence

Add website evidence, Brain context, or an observation. Then generate or refresh.

## Retry failed generation

Retry on the failed Visibility analysis, Audience, Prospect, or Ads campaign. Create a new Social week if a week failed.

## Find saved work

Open the matching module library. Athena does not discard finished work when the user leaves a page.

## Deal with GetOblic capacity

Release a listing that no longer needs to be held. Then add another Directory business if needed.

## Apply Social Planner suggestions

Ask Athena about a Ready week or day. Review. Apply Athena's Suggestions only if a new week version is wanted.

---

# Troubleshooting

## Generation is taking time

Leave and return. Athena can keep working in the background.

## Generation failed

Retry on that object when Retry exists. Create a new Social week if needed.

## Website research is unavailable

A usable website URL is required. Identity Deep Scrape also needs a Ready Brain.

## Technical Visibility needs richer website intelligence

Open Identity, add the website and Retrain, or run Identity Deep Scrape (which retrains Athena Brain automatically), then return to Visibility.

## Intelligence is incomplete

Add evidence, then refresh or generate.

## Wrong Audience information

Edit the profile. Save alone does not regenerate intelligence. Then generate or refresh. Add an observation if new facts exist.

## Wrong Prospect information

Edit the facts. Meaningful edits may queue a refresh. Add an observation if needed.

## Identity changes did not appear

For Voice, Business Knowledge, or website edits, Train or Retrain. A successful Identity Deep Scrape already retrains Athena Brain — do not Retrain again after it finishes.

## GetOblic capacity is full

Release a listing.

## Create Audience from Prospect is unavailable

Wait until Prospect intelligence is Ready.

## Ask or Discuss did not change anything

Expected, except Social Planner Apply Athena's Suggestions.

---

# Tools Reference

Current V2 modules:

- Athena Brain
- Visibility
- Audiences
- Advertising
- Social Content
- Prospects

Some older intelligence tools may remain reachable in a workspace. They are not part of the current Athena V2 growth path.

Do not teach Inbox, Discussions, Opportunities, Briefings, Intelligence Domains, Communities, or Reviews as the current operating model.

Do not explain Super Admin or Licensee control-plane functionality.

---

# What this assistant must not do

- Never claim to perform actions.
- Never mutate onboarding state.
- Never generate intelligence, trigger scraping, publish, access a Prospect record, or load business data.
- Never claim that Athena saved, updated, published, generated, scraped, or imported anything during this conversation.
- Never invent undocumented, planned, or admin-only capabilities.
- If a behavior is not documented here, say it is not documented in the current Athena Help Center guidance.

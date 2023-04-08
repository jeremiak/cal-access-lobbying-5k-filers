# People who pay more than $5K to influence legislation in California

A `.csv` of $5k+ filers for each session, scraped daily from [California Secretary of State](https://cal-access.sos.ca.gov/Lobbying/Payments/).

Description of this data from the SoS:
> Search alphabetically for persons spending $5,000 or more to influence legislative or administrative action. These filers do not employ a lobbyist and do not contract with a lobbying firm. They file each calendar quarter in which they spend $5,000 or more to influence legislative or administrative action.

## Running

```
deno run --allow-read=5k-filers.csv --allow-write=5k-filers.csv --allow-net ./scrape.ts
```
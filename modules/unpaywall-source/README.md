# Unpaywall Source

Finds open-access full-text links for records with DOIs. Fixture and snapshot modes are offline and deterministic. `live_archived` mode calls the Unpaywall API, writes raw responses under the artifact directory, and refuses to emit non-OA PDF links.


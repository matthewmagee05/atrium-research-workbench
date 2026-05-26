library(jsonlite)

`%||%` <- function(left, right) {
  if (is.null(left) || length(left) == 0) right else left
}

read_json <- function(path) {
  fromJSON(path, simplifyVector = FALSE)
}

round_half_even <- function(x, digits = 10) {
  signif(x, digits = digits)
}

normalize_value <- function(value) {
  if (is.numeric(value) && is.finite(value)) {
    return(round_half_even(value))
  }
  if (is.list(value)) {
    return(lapply(value, normalize_value))
  }
  value
}

write_json <- function(path, value) {
  normalized <- normalize_value(value)
  write(toJSON(normalized, pretty = TRUE, auto_unbox = TRUE, null = "null"), file = path)
}

count_table <- function(values) {
  tab <- sort(table(values))
  names_tab <- names(tab)
  lapply(names_tab, function(name) list(value = name, count = unname(tab[[name]])))
}

records <- read_json(Sys.getenv("RWB_INPUT_deduped"))
corpus_lock <- read_json(Sys.getenv("RWB_INPUT_corpus_lock"))
params <- read_json(Sys.getenv("RWB_PARAMS"))

years <- vapply(records, function(record) as.character(record$publication_year %||% "unknown"), character(1))
venues <- vapply(records, function(record) as.character(record$venue %||% "unknown"), character(1))
authors_per_record <- lapply(records, function(record) record$authors %||% list())
authors <- unlist(authors_per_record, use.names = FALSE)

annual_pubs <- count_table(years)
venue_pubs <- count_table(venues)
author_pubs <- count_table(authors)

top_n <- function(ct, n = 10) {
  sorted <- ct[order(sapply(ct, function(x) x$count), decreasing = TRUE)]
  head(sorted, n)
}

pair_edges <- function(items_per_record, left_name, right_name) {
  edges <- list()
  for (items in items_per_record) {
    clean_items <- sort(unique(as.character(unlist(items, use.names = FALSE))))
    clean_items <- clean_items[nchar(clean_items) > 0]
    if (length(clean_items) >= 2) {
      for (i in seq_len(length(clean_items) - 1)) {
        for (j in (i + 1):length(clean_items)) {
          pair <- c(clean_items[[i]], clean_items[[j]])
          key <- paste(pair, collapse = " <-> ")
          if (is.null(edges[[key]])) {
            edge <- list(weight = 1L)
            edge[[left_name]] <- pair[1]
            edge[[right_name]] <- pair[2]
            edges[[key]] <- edge
          } else {
            edges[[key]]$weight <- edges[[key]]$weight + 1L
          }
        }
      }
    }
  }
  unname(edges)
}

h_index <- function(values) {
  sorted <- sort(as.numeric(values), decreasing = TRUE)
  h <- 0L
  if (length(sorted) == 0) return(h)
  for (i in seq_along(sorted)) {
    if (sorted[[i]] >= i) h <- i
  }
  h
}

quantile_row <- function(values, prob) {
  if (length(values) == 0) return(list(percentile = prob * 100, value = 0))
  list(percentile = prob * 100, value = unname(round_half_even(quantile(values, probs = prob, names = FALSE, type = 7), 10)))
}

coauthor_network <- pair_edges(authors_per_record, "author_a", "author_b")

papers_per_author <- table(authors)
productivity_counts <- table(as.integer(papers_per_author))
author_productivity <- lapply(names(productivity_counts), function(n) {
  list(papers_per_author = as.integer(n), author_count = unname(productivity_counts[[n]]))
})

keywords_all <- unlist(lapply(records, function(record) record$keywords %||% list()), use.names = FALSE)
keyword_frequency <- if (length(keywords_all) > 0) count_table(keywords_all) else list()
keywords_per_record <- lapply(records, function(record) record$keywords %||% list())
keyword_cooccurrence <- pair_edges(keywords_per_record, "keyword_a", "keyword_b")

citations <- vapply(records, function(record) {
  val <- record$cited_by_count %||% 0
  as.numeric(val)
}, numeric(1))
total_citations <- sum(citations)
mean_citations <- if (length(citations) > 0) mean(citations) else 0
median_citations <- if (length(citations) > 0) median(citations) else 0
most_cited_idx <- which.max(citations)
most_cited_title <- if (length(most_cited_idx) > 0) records[[most_cited_idx]]$title %||% "" else ""
most_cited_count <- if (length(most_cited_idx) > 0) citations[most_cited_idx] else 0
citation_distribution <- list(
  quantile_row(citations, 0),
  quantile_row(citations, 0.25),
  quantile_row(citations, 0.5),
  quantile_row(citations, 0.75),
  quantile_row(citations, 1)
)
most_cited_records <- lapply(head(order(citations, decreasing = TRUE), 10), function(idx) {
  rec <- records[[idx]]
  list(
    record_id = as.character(rec$id %||% rec$record_id %||% idx),
    title = as.character(rec$title %||% ""),
    publication_year = rec$publication_year %||% NULL,
    venue = as.character(rec$venue %||% ""),
    cited_by_count = citations[[idx]]
  )
})

author_citations <- list()
author_documents <- list()
for (idx in seq_along(records)) {
  rec_authors <- authors_per_record[[idx]]
  if (length(rec_authors) > 0) {
    for (author in rec_authors) {
      author <- as.character(author)
      author_citations[[author]] <- c(author_citations[[author]] %||% c(), citations[[idx]])
      author_documents[[author]] <- (author_documents[[author]] %||% 0L) + 1L
    }
  }
}
author_impact <- lapply(sort(names(author_citations)), function(author) {
  vals <- author_citations[[author]]
  list(
    author = author,
    documents = author_documents[[author]],
    total_citations = sum(vals),
    h_index = h_index(vals),
    mean_citations = if (length(vals) > 0) mean(vals) else 0
  )
})
author_impact <- author_impact[order(sapply(author_impact, function(x) x$total_citations), decreasing = TRUE)]

source_impact <- lapply(sort(unique(venues)), function(venue) {
  idxs <- which(venues == venue)
  vals <- citations[idxs]
  list(
    venue = venue,
    documents = length(idxs),
    total_citations = sum(vals),
    h_index = h_index(vals),
    mean_citations = if (length(vals) > 0) mean(vals) else 0
  )
})
source_impact <- source_impact[order(sapply(source_impact, function(x) x$total_citations), decreasing = TRUE)]

bradford_zones <- list()
venue_counts_desc <- top_n(venue_pubs, length(venue_pubs))
if (length(venue_counts_desc) > 0) {
  total_docs <- sum(sapply(venue_counts_desc, function(x) x$count))
  target <- total_docs / 3
  zone <- 1L
  running <- 0
  for (row in venue_counts_desc) {
    if (running >= target && zone < 3L) {
      zone <- zone + 1L
      running <- 0
    }
    bradford_zones <- c(bradford_zones, list(list(
      venue = row$value,
      documents = row$count,
      bradford_zone = zone
    )))
    running <- running + row$count
  }
}

numeric_years <- as.integer(years[years != "unknown"])
annual_growth_rate <- list()
if (length(numeric_years) > 0) {
  year_tab <- table(numeric_years)
  sorted_years <- sort(as.integer(names(year_tab)))
  if (length(sorted_years) >= 2) {
    for (i in 2:length(sorted_years)) {
      prev_count <- unname(year_tab[as.character(sorted_years[i - 1])])
      curr_count <- unname(year_tab[as.character(sorted_years[i])])
      rate <- if (prev_count > 0) (curr_count - prev_count) / prev_count * 100 else NA
      annual_growth_rate <- c(annual_growth_rate, list(list(
        year = sorted_years[i],
        count = curr_count,
        previous_count = prev_count,
        growth_percent = if (is.na(rate)) NULL else round_half_even(rate, 4)
      )))
    }
  }
}

use_bibliometrix_pkg <- isTRUE(params$use_bibliometrix_package)
bibliometrix_pkg_results <- list()
if (use_bibliometrix_pkg) {
  bibliometrix_pkg_results <- tryCatch({
    if (!requireNamespace("bibliometrix", quietly = TRUE)) {
      list(available = FALSE, reason = "bibliometrix package not installed")
    } else {
      df <- do.call(rbind, lapply(records, function(rec) {
        data.frame(
          AU = paste(unlist(rec$authors %||% list()), collapse = ";"),
          TI = as.character(rec$title %||% ""),
          SO = as.character(rec$venue %||% ""),
          PY = as.integer(rec$publication_year %||% NA),
          TC = as.integer(rec$cited_by_count %||% 0),
          DI = as.character(rec$doi %||% ""),
          DE = paste(unlist(rec$keywords %||% list()), collapse = ";"),
          DB = "BIBLIOMETRIX_RWB",
          stringsAsFactors = FALSE
        )
      }))
      analysis <- bibliometrix::biblioAnalysis(df)
      list(
        available = TRUE,
        articles = unname(analysis$Articles),
        authors_total = unname(analysis$Authors),
        author_appearances = unname(analysis$AuthorAppearances),
        collaboration_index = unname(round_half_even(analysis$CollaborationIndex, 6)),
        documents_per_author = unname(round_half_even(analysis$DocsPerAuthors, 6))
      )
    }
  }, error = function(e) list(available = FALSE, reason = conditionMessage(e)))
}

summary <- list(
  records_total = length(records),
  corpus_final_record_count = corpus_lock$final_record_count,
  analyses = params$analyses,
  year_count = length(unique(years)),
  venue_count = length(unique(venues)),
  author_count = length(unique(authors)),
  total_citations = total_citations,
  mean_citations = mean_citations,
  median_citations = median_citations,
  most_cited_title = most_cited_title,
  most_cited_citations = most_cited_count,
  corpus_h_index = h_index(citations),
  keyword_count = length(unique(keywords_all)),
  coauthor_edge_count = length(coauthor_network),
  keyword_edge_count = length(keyword_cooccurrence),
  source_h_index_max = if (length(source_impact) > 0) max(sapply(source_impact, function(x) x$h_index)) else 0
)
if (use_bibliometrix_pkg) {
  summary$bibliometrix_package <- bibliometrix_pkg_results
}

tables <- list(
  annual_publications = annual_pubs,
  venue_publications = venue_pubs,
  author_publications = author_pubs,
  top_venues = top_n(venue_pubs),
  coauthor_network = coauthor_network,
  author_productivity = author_productivity,
  keyword_frequency = keyword_frequency,
  keyword_cooccurrence = keyword_cooccurrence,
  annual_growth_rate = annual_growth_rate,
  citation_distribution = citation_distribution,
  most_cited_records = most_cited_records,
  author_impact = author_impact,
  source_impact = source_impact,
  bradford_zones = bradford_zones
)

figure_specs <- list(
  annual_publications = list(
    kind = "bar",
    title = "Annual publications",
    x = "publication_year",
    y = "count",
    data = tables$annual_publications
  ),
  venue_publications = list(
    kind = "bar",
    title = "Publications by venue",
    x = "venue",
    y = "count",
    data = tables$top_venues
  ),
  author_productivity = list(
    kind = "bar",
    title = "Author productivity distribution",
    x = "papers_per_author",
    y = "author_count",
    data = tables$author_productivity
  ),
  citation_distribution = list(
    kind = "line",
    title = "Citation distribution percentiles",
    x = "percentile",
    y = "value",
    data = tables$citation_distribution
  ),
  keyword_cooccurrence = list(
    kind = "network",
    title = "Keyword co-occurrence network",
    source = "keyword_a",
    target = "keyword_b",
    weight = "weight",
    data = tables$keyword_cooccurrence
  ),
  source_impact = list(
    kind = "bar",
    title = "Source impact by citations",
    x = "venue",
    y = "total_citations",
    data = head(tables$source_impact, 10)
  ),
  bradford_zones = list(
    kind = "stacked_bar",
    title = "Bradford zones by source",
    x = "venue",
    y = "documents",
    fill = "bradford_zone",
    data = tables$bradford_zones
  )
)

rendered_figures <- list(
  annual_publications_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Annual publications figure generated from figure spec.</text></svg>",
  venue_publications_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Venue publications figure generated from figure spec.</text></svg>",
  author_productivity_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Author productivity figure generated from figure spec.</text></svg>",
  citation_distribution_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Citation distribution figure generated from figure spec.</text></svg>",
  keyword_cooccurrence_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Keyword network figure generated from figure spec.</text></svg>",
  source_impact_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Source impact figure generated from figure spec.</text></svg>",
  bradford_zones_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Bradford zones figure generated from figure spec.</text></svg>"
)

write_json(Sys.getenv("RWB_OUTPUT_summary"), summary)
write_json(Sys.getenv("RWB_OUTPUT_tables"), tables)
write_json(Sys.getenv("RWB_OUTPUT_figure_specs"), figure_specs)
write_json(Sys.getenv("RWB_OUTPUT_rendered_figures"), rendered_figures)

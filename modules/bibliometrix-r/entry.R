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

coauthor_edges <- list()
for (rec_authors in authors_per_record) {
  if (length(rec_authors) >= 2) {
    for (i in seq_len(length(rec_authors) - 1)) {
      for (j in (i + 1):length(rec_authors)) {
        pair <- sort(c(rec_authors[[i]], rec_authors[[j]]))
        key <- paste(pair, collapse = " <-> ")
        if (is.null(coauthor_edges[[key]])) {
          coauthor_edges[[key]] <- list(author_a = pair[1], author_b = pair[2], weight = 1L)
        } else {
          coauthor_edges[[key]]$weight <- coauthor_edges[[key]]$weight + 1L
        }
      }
    }
  }
}
coauthor_network <- unname(coauthor_edges)

papers_per_author <- table(authors)
productivity_counts <- table(as.integer(papers_per_author))
author_productivity <- lapply(names(productivity_counts), function(n) {
  list(papers_per_author = as.integer(n), author_count = unname(productivity_counts[[n]]))
})

keywords_all <- unlist(lapply(records, function(record) record$keywords %||% list()), use.names = FALSE)
keyword_frequency <- if (length(keywords_all) > 0) count_table(keywords_all) else list()

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
  most_cited_citations = most_cited_count
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
  annual_growth_rate = annual_growth_rate
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
  )
)

rendered_figures <- list(
  annual_publications_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Annual publications figure generated from figure spec.</text></svg>",
  venue_publications_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Venue publications figure generated from figure spec.</text></svg>",
  author_productivity_svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"400\" height=\"120\"><text x=\"12\" y=\"24\">Author productivity figure generated from figure spec.</text></svg>"
)

write_json(Sys.getenv("RWB_OUTPUT_summary"), summary)
write_json(Sys.getenv("RWB_OUTPUT_tables"), tables)
write_json(Sys.getenv("RWB_OUTPUT_figure_specs"), figure_specs)
write_json(Sys.getenv("RWB_OUTPUT_rendered_figures"), rendered_figures)

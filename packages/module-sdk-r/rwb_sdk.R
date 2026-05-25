library(jsonlite)

`%||%` <- function(left, right) {
  if (is.null(left) || length(left) == 0) right else left
}

rwb_round_half_even <- function(x, digits = 10) {
  signif(x, digits = digits)
}

rwb_normalize_value <- function(value) {
  if (is.numeric(value) && is.finite(value)) {
    return(rwb_round_half_even(value))
  }
  if (is.list(value)) {
    if (!is.null(names(value))) {
      ordered <- value[order(names(value))]
      return(lapply(ordered, rwb_normalize_value))
    }
    return(lapply(value, rwb_normalize_value))
  }
  value
}

rwb_read_json <- function(path) {
  fromJSON(path, simplifyVector = FALSE)
}

rwb_write_json <- function(path, value) {
  normalized <- rwb_normalize_value(value)
  dir.create(dirname(path), recursive = TRUE, showWarnings = FALSE)
  write(toJSON(normalized, pretty = TRUE, auto_unbox = TRUE, null = "null"), file = path)
}

rwb_proxy_call <- function(operation, payload) {
  base_url <- Sys.getenv("RWB_PROXY_SOCKET")
  if (nchar(base_url) == 0) stop("RWB_PROXY_SOCKET is not configured")
  url <- paste0(sub("/$", "", base_url), "/", operation)
  body <- toJSON(payload, auto_unbox = TRUE, null = "null")
  response <- tryCatch(
    {
      con <- url(url, method = "libcurl")
      on.exit(close(con))
      result <- httr2::request(url) |>
        httr2::req_body_raw(charToRaw(body), type = "application/json") |>
        httr2::req_timeout(120) |>
        httr2::req_perform()
      fromJSON(httr2::resp_body_string(result), simplifyVector = FALSE)
    },
    error = function(e) {
      tmp_file <- tempfile(fileext = ".json")
      writeLines(body, tmp_file)
      result <- system2("curl", c("-s", "-X", "POST",
        "-H", "Content-Type: application/json",
        "-d", paste0("@", tmp_file),
        "--max-time", "120",
        url), stdout = TRUE, stderr = FALSE)
      fromJSON(paste(result, collapse = ""), simplifyVector = FALSE)
    }
  )
  response
}

rwb_llm_complete <- function(provider, model, messages, schema = NULL, max_output_tokens = NULL) {
  rwb_proxy_call("llm.complete", list(
    binding = list(provider = provider, model_id = model),
    messages = messages,
    schema = schema,
    max_output_tokens = max_output_tokens
  ))
}

rwb_journal_note <- function(text, metadata = list()) {
  rwb_proxy_call("journal.note", list(text = text, metadata = metadata))
}

rwb_review_request <- function(payload, schema) {
  rwb_proxy_call("review.request", list(payload = payload, schema = schema))
}

rwb_progress_update <- function(percent, message) {
  rwb_proxy_call("progress.update", list(percent = percent, message = message))
}

rwb_artifact_read_metadata <- function(artifact_id) {
  rwb_proxy_call("artifact.read_metadata", list(artifact_id = artifact_id))
}

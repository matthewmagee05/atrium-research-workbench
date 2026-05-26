library(jsonlite)

read_json <- function(path) fromJSON(path, simplifyVector = FALSE)
write_json <- function(path, value) write(toJSON(value, pretty = TRUE, auto_unbox = TRUE, null = "null"), file = path)
round_sig <- function(x) signif(x, digits = 10)

payload <- read_json(Sys.getenv("RWB_INPUT_effects"))
rows <- payload$rows
k <- length(rows)
if (k == 0) {
  stop("meta-analysis-r requires at least one effect row")
}

effects <- vapply(rows, function(row) as.numeric(row$effect), numeric(1))
ses <- vapply(rows, function(row) as.numeric(row$se), numeric(1))
vars <- ses ^ 2
fixed_weights <- 1 / vars
fixed_effect <- sum(fixed_weights * effects) / sum(fixed_weights)
q <- sum(fixed_weights * (effects - fixed_effect) ^ 2)
c_value <- sum(fixed_weights) - (sum(fixed_weights ^ 2) / sum(fixed_weights))
tau2 <- if (k > 1 && c_value > 0) max(0, (q - (k - 1)) / c_value) else 0
random_weights <- 1 / (vars + tau2)
pooled <- sum(random_weights * effects) / sum(random_weights)
pooled_se <- sqrt(1 / sum(random_weights))
i2 <- if (q > 0 && k > 1) max(0, (q - (k - 1)) / q) * 100 else 0
ci <- c(pooled - 1.96 * pooled_se, pooled + 1.96 * pooled_se)
pred_se <- sqrt(tau2 + pooled_se ^ 2)
prediction <- c(pooled - 1.96 * pred_se, pooled + 1.96 * pred_se)

summary <- list(
  k = as.integer(k),
  pooled_effect = round_sig(pooled),
  pooled_se = round_sig(pooled_se),
  ci95 = as.list(round_sig(ci)),
  q = round_sig(q),
  i2 = round_sig(i2),
  tau2 = round_sig(tau2),
  prediction_interval = as.list(round_sig(prediction))
)

studies <- lapply(seq_along(rows), function(i) {
  label <- rows[[i]]$label
  if (is.null(label)) label <- rows[[i]]$record_id
  list(
    record_id = rows[[i]]$record_id,
    label = label,
    effect = round_sig(effects[[i]]),
    se = round_sig(ses[[i]]),
    ci95 = as.list(round_sig(c(effects[[i]] - 1.96 * ses[[i]], effects[[i]] + 1.96 * ses[[i]])))
  )
})

write_json(Sys.getenv("RWB_OUTPUT_meta_summary"), summary)
write_json(Sys.getenv("RWB_OUTPUT_forest_plot_spec"), list(kind = "forest_plot", studies = studies, summary = summary))

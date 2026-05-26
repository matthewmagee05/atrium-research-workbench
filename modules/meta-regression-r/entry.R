library(jsonlite)
payload <- fromJSON(Sys.getenv("RWB_INPUT_effects"), simplifyVector = FALSE)
rows <- payload$rows
effects <- vapply(rows, function(row) as.numeric(row$effect), numeric(1))
ses <- vapply(rows, function(row) as.numeric(row$se), numeric(1))
x <- seq_along(effects)
fit <- lm(effects ~ x, weights = 1 / (ses ^ 2))
out <- list(coefficients = as.list(signif(coef(fit), 10)), k = length(effects), method = "weighted_lm_fixture")
write(toJSON(out, pretty = TRUE, auto_unbox = TRUE), file = Sys.getenv("RWB_OUTPUT_meta_regression"))


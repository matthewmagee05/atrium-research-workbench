library(jsonlite)
payload <- fromJSON(Sys.getenv("RWB_INPUT_effects"), simplifyVector = FALSE)
rows <- payload$rows
effects <- vapply(rows, function(row) as.numeric(row$effect), numeric(1))
ses <- vapply(rows, function(row) as.numeric(row$se), numeric(1))
precision <- 1 / ses
egger <- if (length(effects) > 2) signif(coef(lm(effects / ses ~ precision))[2], 10) else NA
points <- lapply(seq_along(effects), function(i) list(effect = signif(effects[[i]], 10), se = signif(ses[[i]], 10)))
out <- list(kind = "funnel_plot", points = points, egger_slope = if (is.na(egger)) NULL else egger)
write(toJSON(out, pretty = TRUE, auto_unbox = TRUE, null = "null"), file = Sys.getenv("RWB_OUTPUT_funnel_plot"))


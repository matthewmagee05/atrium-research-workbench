# Supplementary Bundle

Creates a structured supplement manifest. Bundle export remains responsible for packaging actual files into a shareable directory or archive.

The output includes each connected input's path, byte size, SHA-256 hash, an index markdown document, and a packaging status. This keeps the supplement packet inspectable and hash-verifiable instead of hiding it inside an opaque generated zip.

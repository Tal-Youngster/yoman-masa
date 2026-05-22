---
type: accommodation
id: acc_01H7
trip_id: trp_01HABC
name: "Hotel: Le Méridien"
confirmation: ABC#123
note: leading & trailing
host_phone: +84 90 123 4567
---

The `name` field keeps quotes because `Hotel:` would otherwise look like a mapping key.
Non-leading `#`, `&`, `+` are not significant in YAML 1.2, so the other strings are unquoted.

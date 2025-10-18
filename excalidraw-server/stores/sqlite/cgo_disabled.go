//go:build !cgo

package sqlite

// CGOEnabled reports whether the sqlite store is built with cgo support.
// The go-sqlite3 driver requires cgo; tests skip when it's unavailable.
const CGOEnabled = false

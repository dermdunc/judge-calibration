Fix the bug in `receipts/grouping.py`'s `group_expenses_by_category` function.

The function is supposed to group a list of expense records by their `category` field and
return a dict mapping each category to the list of expenses in it, sorted by category name.
The existing test suite (`tests/test_grouping.py`) defines the expected behavior. Currently, one
test fails: `test_none_category_becomes_uncategorized` passes a list of THREE expenses - one
`category="dining"`, one `category="travel"`, and one `category=None` - and expects the `None`
one to be grouped under the key `"uncategorized"`. Instead the function crashes:

```
TypeError: '<' not supported between instances of 'NoneType' and 'str'
```

This only happens with more than one category present: `sorted()` on `groups.items()` compares
consecutive key pairs to order them, and comparing `None < "dining"` (or any `str`) raises this
error in Python 3. A single-category list (or a list of only `None`-category expenses) never
triggers a comparison at all, so it never reproduces the crash - the bug only shows up once the
result actually needs sorting across more than one distinct key.

Fix the actual bug in `grouping.py`. Do not modify the test file.

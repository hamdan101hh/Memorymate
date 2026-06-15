"""Mongo client TLS helpers (no live DB connection)."""
from mongo_client import mongo_client_kwargs


def test_srv_uri_uses_certifi_ca_bundle():
    kwargs = mongo_client_kwargs("mongodb+srv://example.invalid/")
    assert kwargs.get("tlsCAFile")


def test_local_uri_no_extra_kwargs():
    kwargs = mongo_client_kwargs("mongodb://127.0.0.1:27017")
    assert "tlsCAFile" not in kwargs

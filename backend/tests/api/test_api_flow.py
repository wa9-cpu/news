from fastapi.testclient import TestClient

from news_research.api.main import app


def test_health():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_research_and_article_flow():
    client = TestClient(app)

    create = client.post("/api/v1/research", json={"query": "climate policy"})
    assert create.status_code == 200
    request_id = create.json()["request_id"]

    results = client.get(f"/api/v1/research/{request_id}")
    assert results.status_code == 200
    data = results.json()
    assert data["summary"]["facts"]
    assert data["explore_more_cards"]

    card = data["explore_more_cards"][0]
    article = client.post(
        "/api/v1/article/generate",
        json={
            "request_id": request_id,
            "card_id": card["card_id"],
            "headline_id": card["headline_id"],
        },
    )
    assert article.status_code == 200
    article_id = article.json()["article_id"]

    fetch = client.get(f"/api/v1/article/{article_id}")
    assert fetch.status_code == 200

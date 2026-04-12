import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="SDN Management API")

ODL_BASE_URL = os.getenv("ODL_BASE_URL", "http://127.0.0.1:8181")
ODL_USERNAME = os.getenv("ODL_USERNAME", "admin")
ODL_PASSWORD = os.getenv("ODL_PASSWORD", "admin")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/topology")
def get_topology():
    url = f"{ODL_BASE_URL}/rests/data/network-topology:network-topology/topology=flow:1"

    try:
        resp = requests.get(
            url,
            auth=(ODL_USERNAME, ODL_PASSWORD),
            headers={"Accept": "application/json"},
            timeout=10,
        )
    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Cannot reach OpenDaylight: {e}")

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return JSONResponse(content=resp.json())

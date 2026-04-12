import os
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class Settings(BaseModel):
    app_name: str = "SDN Management Backend"
    app_version: str = "0.1.0"
    odl_base_url: str = "http://127.0.0.1:8181"
    odl_username: str = "admin"
    odl_password: str = "admin"
    odl_timeout_seconds: float = Field(default=10.0, gt=0)
    odl_topology_id: str = Field(default="flow:1", min_length=1)

    @property
    def normalized_odl_base_url(self) -> str:
        return self.odl_base_url.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "SDN Management Backend"),
        app_version=os.getenv("APP_VERSION", "0.1.0"),
        odl_base_url=os.getenv("ODL_BASE_URL", "http://127.0.0.1:8181"),
        odl_username=os.getenv("ODL_USERNAME", "admin"),
        odl_password=os.getenv("ODL_PASSWORD", "admin"),
        odl_timeout_seconds=os.getenv("ODL_TIMEOUT_SECONDS", "10"),
        odl_topology_id=os.getenv("ODL_TOPOLOGY_ID", "flow:1"),
    )

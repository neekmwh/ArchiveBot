import pytest
from fastapi import status
from sqlalchemy.orm import Session
from app.db.models import User, UserRole

def test_login_successful(client, db_session: Session):
    response = client.post(
        "/api/v1/auth/login",
        json={"phone_number": "09123456789", "otp_code": "1234"}
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_user_not_found(client, db_session: Session):
    response = client.post(
        "/api/v1/auth/login",
        json={"phone_number": "09120000000", "otp_code": "1234"}
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "کاربری با این شماره تلفن یافت نشد" in response.json()["detail"]

def test_login_inactive_user(client, db_session: Session):
    # Set user inactive
    user = db_session.query(User).filter(User.phone_number == "09128888888").first()
    user.is_active = False
    db_session.commit()

    response = client.post(
        "/api/v1/auth/login",
        json={"phone_number": "09128888888", "otp_code": "1234"}
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "غیرفعال است" in response.json()["detail"]

    # Restore
    user.is_active = True
    db_session.commit()

def test_login_wrong_otp(client, db_session: Session):
    response = client.post(
        "/api/v1/auth/login",
        json={"phone_number": "09123456789", "otp_code": "9999"}
    )
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert "کد یکبار مصرف وارد شده نامعتبر" in response.json()["detail"]

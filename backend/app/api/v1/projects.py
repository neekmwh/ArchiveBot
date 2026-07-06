import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db, set_tenant_context
from app.db.models import Project, User, UserRole
from app.schemas.schemas import ProjectResponse, ProjectCreate, ProjectUpdate
from app.api.deps import get_current_user, RoleChecker

router = APIRouter()

@router.get("/", response_model=List[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    List all projects for the authenticated tenant. (Filtered by PostgreSQL RLS).
    """
    query = select(Project).offset(skip).limit(limit)
    projects = db.scalars(query).all()
    return projects

@router.post("/", response_model=ProjectResponse)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN]))
) -> Any:
    """
    Creates a new project for the tenant. (OWNER/ADMIN only).
    """
    set_tenant_context(db, str(current_user.tenant_id))
    
    project = Project(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        status=payload.status
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN]))
) -> Any:
    """
    Updates an existing project. (OWNER/ADMIN only).
    """
    set_tenant_context(db, str(current_user.tenant_id))
    project = db.get(Project, project_id)
    
    if not project or str(project.tenant_id) != str(current_user.tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="پروژه مورد نظر یافت نشد."
        )
        
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(project, field, value)
        
    db.commit()
    db.refresh(project)
    return project

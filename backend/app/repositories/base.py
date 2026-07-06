from typing import Generic, TypeVar, Type, Any, Optional, Sequence
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.db.session import set_tenant_context

ModelType = TypeVar("ModelType")

class BaseRepository(Generic[ModelType]):
    def __init__(self, model: Type[ModelType]):
        self.model = model

    def get_by_id(self, db: Session, id: Any, tenant_id: Optional[str] = None) -> Optional[ModelType]:
        """
        Retrieve a single record by its primary key ID.
        If tenant_id is provided, sets the tenant session context first.
        """
        if tenant_id:
            set_tenant_context(db, tenant_id)
        return db.get(self.model, id)

    def get_multi(
        self, 
        db: Session, 
        *, 
        skip: int = 0, 
        limit: int = 100, 
        tenant_id: Optional[str] = None
    ) -> Sequence[ModelType]:
        """
        Retrieve multiple records.
        If tenant_id is provided, sets the tenant session context first.
        """
        if tenant_id:
            set_tenant_context(db, tenant_id)
        
        query = select(self.model).offset(skip).limit(limit)
        return db.scalars(query).all()

    def create(self, db: Session, *, obj_in_data: dict[str, Any], tenant_id: Optional[str] = None) -> ModelType:
        """
        Insert a new record.
        If tenant_id is provided, sets the tenant session context first.
        """
        if tenant_id:
            set_tenant_context(db, tenant_id)
            if "tenant_id" not in obj_in_data:
                obj_in_data["tenant_id"] = tenant_id

        db_obj = self.model(**obj_in_data)
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def update(
        self, 
        db: Session, 
        *, 
        db_obj: ModelType, 
        obj_in_data: dict[str, Any], 
        tenant_id: Optional[str] = None
    ) -> ModelType:
        """
        Update an existing record.
        If tenant_id is provided, sets the tenant session context first.
        """
        if tenant_id:
            set_tenant_context(db, tenant_id)

        for field, value in obj_in_data.items():
            if hasattr(db_obj, field):
                setattr(db_obj, field, value)
        
        db.add(db_obj)
        db.commit()
        db.refresh(db_obj)
        return db_obj

    def remove(self, db: Session, *, id: Any, tenant_id: Optional[str] = None) -> Optional[ModelType]:
        """
        Delete a record by ID.
        If tenant_id is provided, sets the tenant session context first.
        """
        if tenant_id:
            set_tenant_context(db, tenant_id)

        obj = db.get(self.model, id)
        if obj:
            db.delete(obj)
            db.commit()
        return obj

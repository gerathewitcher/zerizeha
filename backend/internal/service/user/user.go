package user

import (
	"zerizeha/internal/dto"
	"zerizeha/internal/repository"
	"zerizeha/internal/service"
)

type serv struct {
	repo repository.UserRepository
}

func NewUserService(repo repository.UserRepository) service.UserService {
	return &serv{repo: repo}
}

func (s *serv) CreateUser(user dto.UserToCreate) (userID string, err error) {
	return s.repo.CreateUser(user)
}

func (s *serv) GetUserByID(id string) (dto.User, error) {
	return s.repo.GetUserByID(id)
}

func (s *serv) GetUserByEmail(email string) (dto.User, error) {
	return s.repo.GetUserByEmail(email)
}

func (s *serv) ListUsers() ([]dto.User, error) {
	return s.repo.ListUsers()
}

func (s *serv) GetUsersByIDs(ids []string) ([]dto.User, error) {
	return s.repo.GetUsersByIDs(ids)
}

func (s *serv) SearchUsers(query string, limit int, cursor *dto.UserSearchCursor, confirmedOnly bool, confirmedFilter *bool) ([]dto.User, *dto.UserSearchCursor, error) {
	return s.repo.SearchUsers(query, limit, cursor, confirmedOnly, confirmedFilter)
}

func (s *serv) SetUserConfirmed(id string, confirmed bool, confirmedBy string) error {
	return s.repo.SetUserConfirmed(id, confirmed, confirmedBy)
}

func (s *serv) UpdateUserInfo(id string, user dto.UserToUpdate) error {
	return s.repo.UpdateUserInfo(id, user)
}

func (s *serv) SyncAdminsByEmails(emails []string) error {
	return s.repo.SyncAdminsByEmails(emails)
}

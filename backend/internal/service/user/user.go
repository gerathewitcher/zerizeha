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

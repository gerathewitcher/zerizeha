package pg_user_repo

import "zerizeha/internal/dto"

func ToUserFromRepo(user User) *dto.User {
	return &dto.User{
		ID:          user.id,
		Username:    user.username,
		Email:       user.email,
		Confirmed:   user.confirmed,
		ConfirmedAt: user.confirmedAt,
		ConfirmedBy: user.confirmedBy,
		IsAdmin:     user.isAdmin,
		CreatedAt:   user.createdAt,
	}
}

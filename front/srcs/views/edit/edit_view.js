
import View from "@/lib/view";
import httpRequest from "@/utils/httpRequest";

export default class EditView extends View {
  constructor({data}) {
    super();
    this.data = data
  }

  async _imgUploadEffect() {
    const editProfileImg = this.querySelector('.edit-profile-img');
    const profileImg = editProfileImg.querySelector('.img-profile');
    const imgWrapper = editProfileImg.querySelector('.img-wrapper');
    const imgInput = editProfileImg.querySelector('input');
    const imgContainer = editProfileImg.querySelector('.test');
    
    const user = 'jeseo';
    const url = `http://${window.location.hostname}:8000/users/${user}/profile`

    await httpRequest('GET', url, null, (data) => {
      profileImg.src = `data:image;base64,${data.avatar}`;
    })

    imgContainer.addEventListener('mouseenter', e => {
      imgWrapper.style.display = 'block';
    }, false);
  
    imgContainer.addEventListener('mouseleave', e => {
      imgWrapper.style.display = 'none';
    }, false);
  
    imgInput.addEventListener('input', e => {
      if (imgInput.files && imgInput.files[0]) {
        profileImg.src = URL.createObjectURL(file.files[0]);
      }
    });
  }

  _editBtnEvent() {
    const btnSave = this.querySelector('.btn-save');
    const btnCancel = this.querySelector('.btn-cancel');
    const messageInput = this.querySelector('.edit-user-message-input')
    const imgInput = this.querySelector('.edit-user-img-input')
    
    const user = 'jeseo';
    
    btnSave.addEventListener('click', async () => {
      const reader = new FileReader();
      const file = imgInput.files[0];
      const url = `http://${window.location.hostname}:8000/users/${user}/profile/`;

      if (!file)
      {
        const body = JSON.stringify({
          "message" : `${messageInput.value}`
        });
        await httpRequest('PATCH', url, body, () => {
          alert(`${user}'s profile is successfully edited!`);
          history.back();
        })
        return ;
      }

      reader.addEventListener('load', async (e) => {
        const fileData = btoa(e.target.result);

        const body = JSON.stringify({
          "avatar": `${fileData}`,
          "message" : `${messageInput.value}`
        });
        await httpRequest('PATCH', url, body, () => {
          alert(`${user}'s profile is successfully edited!`);
          history.back();
        })
      });
      reader.readAsBinaryString(file);
    });

    btnCancel.addEventListener('click', () => {
      history.back();
    });
  }
    
  connectedCallback() {
    super.connectedCallback();
    
    this._imgUploadEffect();
    this._editBtnEvent();
  }
}

